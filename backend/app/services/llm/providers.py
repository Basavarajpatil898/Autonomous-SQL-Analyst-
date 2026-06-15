import re
from dataclasses import dataclass

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_ollama import ChatOllama

from app.core.config import Settings
from app.core.errors import ConfigurationError, LLMProviderError
from app.services.llm.prompts import build_generation_chain, build_repair_chain


@dataclass
class SQLGenerationContext:
    question: str
    schema_context: str
    dialect: str
    max_rows: int
    failed_sql: str | None = None
    error_message: str | None = None


class BaseSQLProvider:
    provider_name = "base"

    def __init__(self, llm) -> None:
        self._generation_chain = build_generation_chain(llm)
        self._repair_chain = build_repair_chain(llm)

    async def generate_sql(self, context: SQLGenerationContext) -> str:
        payload = {
            "question": context.question,
            "schema_context": context.schema_context,
            "dialect": context.dialect,
            "max_rows": context.max_rows,
            "failed_sql": context.failed_sql,
            "error_message": context.error_message,
        }

        try:
            if context.failed_sql and context.error_message:
                raw_sql = await self._repair_chain.ainvoke(payload)
            else:
                raw_sql = await self._generation_chain.ainvoke(payload)
        except Exception as exc:
            raise LLMProviderError(f"{self.provider_name} could not generate SQL: {exc}") from exc

        return self._sanitize_sql(raw_sql)

    @staticmethod
    def _sanitize_sql(sql: str) -> str:
        cleaned = sql.strip()
        cleaned = re.sub(r"^```sql\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"^```\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        cleaned = cleaned.strip()

        if ";" in cleaned:
            cleaned = cleaned.split(";")[0].strip()

        return cleaned


class OllamaSQLProvider(BaseSQLProvider):
    provider_name = "ollama"

    def __init__(self, settings: Settings) -> None:
        llm = ChatOllama(
            model=settings.ollama_model,
            base_url=settings.ollama_base_url,
            temperature=0,
        )
        super().__init__(llm)


class GeminiSQLProvider(BaseSQLProvider):
    provider_name = "gemini"

    def __init__(self, settings: Settings) -> None:
        if not settings.gemini_api_key:
            raise ConfigurationError("GEMINI_API_KEY is not configured.")

        llm = ChatGoogleGenerativeAI(
            model=settings.gemini_model,
            google_api_key=settings.gemini_api_key,
            temperature=0,
        )
        super().__init__(llm)

