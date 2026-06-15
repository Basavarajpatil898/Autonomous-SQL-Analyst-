from typing import Any

from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    question: str = Field(..., min_length=3, description="Natural language question for the SQL analyst.")
    max_rows: int = Field(default=50, ge=1, le=500)
    database_url: str | None = Field(
        default=None,
        description="Optional per-request override. Prefer environment variables for production deployments.",
    )


class ColumnMetadata(BaseModel):
    name: str
    data_type: str
    is_numeric: bool
    is_temporal: bool
    is_categorical: bool


class ResultMetadata(BaseModel):
    row_count: int
    column_count: int
    truncated: bool
    columns: list[ColumnMetadata]


class VisualizationRecommendation(BaseModel):
    enabled: bool
    chart_type: str | None = None
    x_field: str | None = None
    y_fields: list[str] = Field(default_factory=list)
    title: str | None = None
    reasoning: str


class AttemptTrace(BaseModel):
    provider: str
    attempt_number: int
    sql: str | None = None
    error: str | None = None


class QueryResponse(BaseModel):
    question: str
    sql: str
    provider_used: str
    rows: list[dict[str, Any]]
    metadata: ResultMetadata
    visualization: VisualizationRecommendation
    attempts: list[AttemptTrace]


class SchemaResponse(BaseModel):
    dialect: str
    tables: list[dict[str, Any]]
    relationships: list[dict[str, Any]]

