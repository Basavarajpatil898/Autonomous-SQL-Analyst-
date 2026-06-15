from collections.abc import Iterable
from datetime import date, datetime
from decimal import Decimal

from app.models.request_response import ColumnMetadata, ResultMetadata, VisualizationRecommendation


def _is_numeric(value) -> bool:
    return isinstance(value, (int, float, Decimal)) and not isinstance(value, bool)


def _is_temporal(value) -> bool:
    return isinstance(value, (datetime, date)) or (
        isinstance(value, str)
        and any(token in value for token in ("-", "/", ":"))
        and len(value) >= 8
    )


def _sample_non_null(values: Iterable):
    for value in values:
        if value is not None:
            return value
    return None


def build_result_metadata(column_names: list[str], rows: list[dict], truncated: bool) -> ResultMetadata:
    columns: list[ColumnMetadata] = []

    for name in column_names:
        sample = _sample_non_null(row.get(name) for row in rows)
        data_type = type(sample).__name__ if sample is not None else "null"
        is_numeric = _is_numeric(sample)
        is_temporal = _is_temporal(sample)
        is_categorical = sample is not None and not is_numeric and not is_temporal
        columns.append(
            ColumnMetadata(
                name=name,
                data_type=data_type,
                is_numeric=is_numeric,
                is_temporal=is_temporal,
                is_categorical=is_categorical,
            )
        )

    return ResultMetadata(
        row_count=len(rows),
        column_count=len(column_names),
        truncated=truncated,
        columns=columns,
    )


def choose_visualization(rows: list[dict], metadata: ResultMetadata) -> VisualizationRecommendation:
    if not rows or metadata.column_count < 2:
        return VisualizationRecommendation(
            enabled=False,
            reasoning="Not enough data columns to recommend a chart.",
        )

    numeric_columns = [column.name for column in metadata.columns if column.is_numeric]
    temporal_columns = [column.name for column in metadata.columns if column.is_temporal]
    categorical_columns = [column.name for column in metadata.columns if column.is_categorical]

    if temporal_columns and numeric_columns:
        return VisualizationRecommendation(
            enabled=True,
            chart_type="line",
            x_field=temporal_columns[0],
            y_fields=[numeric_columns[0]],
            title=f"{numeric_columns[0]} over {temporal_columns[0]}",
            reasoning="A temporal dimension paired with a numeric measure is best shown as a line chart.",
        )

    if len(numeric_columns) >= 2:
        return VisualizationRecommendation(
            enabled=True,
            chart_type="scatter",
            x_field=numeric_columns[0],
            y_fields=[numeric_columns[1]],
            title=f"{numeric_columns[1]} vs {numeric_columns[0]}",
            reasoning="Two numeric columns can be compared clearly in a scatter plot.",
        )

    if categorical_columns and numeric_columns:
        chart_type = "pie" if len(rows) <= 6 else "bar"
        return VisualizationRecommendation(
            enabled=True,
            chart_type=chart_type,
            x_field=categorical_columns[0],
            y_fields=[numeric_columns[0]],
            title=f"{numeric_columns[0]} by {categorical_columns[0]}",
            reasoning="A categorical grouping with one numeric metric maps well to a pie or bar chart.",
        )

    if len(numeric_columns) == 1 and metadata.columns:
        fallback_dimension = metadata.columns[0].name
        return VisualizationRecommendation(
            enabled=True,
            chart_type="bar",
            x_field=fallback_dimension,
            y_fields=[numeric_columns[0]],
            title=f"{numeric_columns[0]} by {fallback_dimension}",
            reasoning="A single numeric metric is most legible as a bar chart against the first column.",
        )

    return VisualizationRecommendation(
        enabled=False,
        reasoning="The result shape is better suited to a table than an automatic chart.",
    )

