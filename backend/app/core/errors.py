from collections.abc import Sequence

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(self, message: str, status_code: int = 400, details: dict | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.details = details or {}


class ConfigurationError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(message, status_code=500)


class DatabaseConnectionError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(message, status_code=500)


class QueryValidationError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(message, status_code=400)


class QueryExecutionError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(message, status_code=400)


class LLMProviderError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__(message, status_code=502)


class ProviderExhaustedError(AppError):
    def __init__(
        self,
        provider_name: str,
        attempts: Sequence[dict],
        last_error: str | None = None,
        failed_sql: str | None = None,
    ) -> None:
        details = {
            "provider": provider_name,
            "attempts": list(attempts),
            "last_error": last_error,
            "failed_sql": failed_sql,
        }
        super().__init__(
            f"{provider_name} exhausted all recovery attempts.",
            status_code=502,
            details=details,
        )
        self.provider_name = provider_name
        self.attempts = list(attempts)
        self.last_error = last_error
        self.failed_sql = failed_sql


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "message": exc.message,
                "details": exc.details,
            },
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(_: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={
                "message": "Unexpected server error.",
                "details": {"error": str(exc)},
            },
        )

