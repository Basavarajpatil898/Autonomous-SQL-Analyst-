from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import get_settings
from app.core.errors import DatabaseConnectionError


@lru_cache(maxsize=8)
def _build_engine(database_url: str) -> Engine:
    try:
        return create_engine(
            database_url,
            pool_pre_ping=True,
            pool_recycle=3600,
            future=True,
        )
    except SQLAlchemyError as exc:
        raise DatabaseConnectionError(f"Could not create a database engine: {exc}") from exc


def get_engine(database_url: str | None = None) -> Engine:
    settings = get_settings()
    return _build_engine(database_url or settings.database_url)

