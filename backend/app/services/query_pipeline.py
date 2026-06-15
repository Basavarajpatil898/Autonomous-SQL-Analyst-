import re
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import Settings
from app.core.errors import (
    DatabaseConnectionError,
    LLMProviderError,
    ProviderExhaustedError,
    QueryExecutionError,
    QueryValidationError,
)
from app.db.connection import get_engine
from app.db.schema import SchemaIntrospector
from app.models.request_response import AttemptTrace, QueryRequest, QueryResponse, SchemaResponse
from app.services.llm.providers import GeminiSQLProvider, OllamaSQLProvider, SQLGenerationContext
from app.services.visualization import build_result_metadata, choose_visualization


FORBIDDEN_SQL_PATTERN = re.compile(
    r"\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|replace)\b",
    flags=re.IGNORECASE,
)


def _serialize_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


class AutonomousQueryService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.schema_introspector = SchemaIntrospector()
        self.ollama_provider = OllamaSQLProvider(settings)
        self.gemini_provider = GeminiSQLProvider(settings) if settings.has_gemini_fallback else None

    def get_schema(self, database_url: str | None = None) -> SchemaResponse:
        snapshot = self.schema_introspector.get_schema_snapshot(database_url)
        return SchemaResponse(**snapshot)

    async def run_query(self, request: QueryRequest) -> QueryResponse:
        max_rows = min(request.max_rows, self.settings.absolute_max_rows)
        snapshot = self.schema_introspector.get_schema_snapshot(request.database_url)
        schema_context = self.schema_introspector.render_schema_for_prompt(snapshot)
        attempts: list[AttemptTrace] = []

        try:
            execution = await self._execute_with_provider(
                provider=self.ollama_provider,
                allowed_attempts=self.settings.ollama_attempts,
                question=request.question,
                schema_context=schema_context,
                dialect=snapshot["dialect"],
                max_rows=max_rows,
                attempts=attempts,
                database_url=request.database_url,
            )
        except ProviderExhaustedError as ollama_failure:
            attempts = [AttemptTrace(**attempt) for attempt in ollama_failure.attempts]

            if not self.gemini_provider:
                raise ProviderExhaustedError(
                    provider_name="pipeline",
                    attempts=[attempt.model_dump() for attempt in attempts],
                    last_error=ollama_failure.last_error,
                    failed_sql=ollama_failure.failed_sql,
                ) from ollama_failure

            execution = await self._execute_with_provider(
                provider=self.gemini_provider,
                allowed_attempts=self.settings.gemini_attempts,
                question=request.question,
                schema_context=schema_context,
                dialect=snapshot["dialect"],
                max_rows=max_rows,
                attempts=attempts,
                database_url=request.database_url,
                failed_sql=ollama_failure.failed_sql,
                error_message=ollama_failure.last_error,
            )

        metadata = build_result_metadata(execution["column_names"], execution["rows"], execution["truncated"])
        visualization = choose_visualization(execution["rows"], metadata)

        return QueryResponse(
            question=request.question,
            sql=execution["sql"],
            provider_used=execution["provider"],
            rows=execution["rows"],
            metadata=metadata,
            visualization=visualization,
            attempts=execution["attempts"],
        )

    async def _execute_with_provider(
        self,
        provider,
        allowed_attempts: int,
        question: str,
        schema_context: str,
        dialect: str,
        max_rows: int,
        attempts: list[AttemptTrace],
        database_url: str | None = None,
        failed_sql: str | None = None,
        error_message: str | None = None,
        attempt_number: int = 1,
    ) -> dict:
        if attempt_number > allowed_attempts:
            raise ProviderExhaustedError(
                provider_name=provider.provider_name,
                attempts=[attempt.model_dump() for attempt in attempts],
                last_error=error_message,
                failed_sql=failed_sql,
            )

        context = SQLGenerationContext(
            question=question,
            schema_context=schema_context,
            dialect=dialect,
            max_rows=max_rows,
            failed_sql=failed_sql,
            error_message=error_message,
        )

        generated_sql = None

        try:
            generated_sql = await provider.generate_sql(context)
            prepared_sql = self._prepare_sql(generated_sql, max_rows=max_rows)
            rows, column_names, truncated = self._execute_sql(prepared_sql, database_url, max_rows=max_rows)
            return {
                "provider": provider.provider_name,
                "sql": prepared_sql,
                "rows": rows,
                "column_names": column_names,
                "truncated": truncated,
                "attempts": attempts
                + [AttemptTrace(provider=provider.provider_name, attempt_number=attempt_number, sql=prepared_sql)],
            }
        except (LLMProviderError, QueryExecutionError, QueryValidationError, DatabaseConnectionError) as exc:
            next_attempts = attempts + [
                AttemptTrace(
                    provider=provider.provider_name,
                    attempt_number=attempt_number,
                    sql=generated_sql,
                    error=str(exc),
                )
            ]
            # Feed the failed SQL and database feedback back into the provider so it can self-correct.
            return await self._execute_with_provider(
                provider=provider,
                allowed_attempts=allowed_attempts,
                question=question,
                schema_context=schema_context,
                dialect=dialect,
                max_rows=max_rows,
                attempts=next_attempts,
                database_url=database_url,
                failed_sql=generated_sql,
                error_message=str(exc),
                attempt_number=attempt_number + 1,
            )

    def _prepare_sql(self, sql: str, max_rows: int) -> str:
        normalized = sql.strip().rstrip(";")

        if not normalized:
            raise QueryValidationError("The LLM returned an empty SQL statement.")

        if FORBIDDEN_SQL_PATTERN.search(normalized):
            raise QueryValidationError("Only read-only analytical SQL is allowed.")

        if not re.match(r"^(select|with)\b", normalized, flags=re.IGNORECASE):
            raise QueryValidationError("Generated SQL must begin with SELECT or WITH.")

        if not re.search(r"\blimit\b", normalized, flags=re.IGNORECASE):
            normalized = f"{normalized} LIMIT {max_rows}"

        return normalized

    def _execute_sql(self, sql: str, database_url: str | None, max_rows: int) -> tuple[list[dict], list[str], bool]:
        engine = get_engine(database_url)

        try:
            with engine.connect() as connection:
                result = connection.execute(text(sql))
                column_names = list(result.keys())
                fetched_rows = result.mappings().fetchmany(max_rows + 1)
        except SQLAlchemyError as exc:
            raise QueryExecutionError(str(exc)) from exc

        truncated = len(fetched_rows) > max_rows
        safe_rows = fetched_rows[:max_rows]
        serialized_rows = [
            {key: _serialize_value(value) for key, value in row.items()}
            for row in safe_rows
        ]

        return serialized_rows, column_names, truncated
