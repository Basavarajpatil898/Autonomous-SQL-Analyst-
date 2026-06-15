from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = Field(default="Autonomous SQL Analyst API")
    api_v1_prefix: str = Field(default="/api/v1")
    database_url: str = Field(
        default="mysql+pymysql://sql_analyst:sql_analyst@127.0.0.1:3306/autonomous_sql_analyst"
    )
    ollama_base_url: str = Field(default="http://127.0.0.1:11434")
    ollama_model: str = Field(default="llama3")
    ollama_attempts: int = Field(default=3, ge=1, le=5)
    gemini_api_key: str | None = Field(default=None)
    gemini_model: str = Field(default="gemini-2.5-flash")
    gemini_attempts: int = Field(default=2, ge=1, le=5)
    request_timeout_seconds: int = Field(default=90, ge=10, le=300)
    default_max_rows: int = Field(default=50, ge=1, le=500)
    absolute_max_rows: int = Field(default=500, ge=10, le=5000)
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://127.0.0.1:5500",
            "http://localhost:5500",
            "http://127.0.0.1:3000",
            "http://localhost:3000",
        ]
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @property
    def has_gemini_fallback(self) -> bool:
        return bool(self.gemini_api_key)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()

