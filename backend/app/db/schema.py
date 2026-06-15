from sqlalchemy import inspect
from sqlalchemy.exc import SQLAlchemyError

from app.core.errors import DatabaseConnectionError
from app.db.connection import get_engine


class SchemaIntrospector:
    def get_schema_snapshot(self, database_url: str | None = None) -> dict:
        engine = get_engine(database_url)

        try:
            inspector = inspect(engine)
            tables: list[dict] = []
            relationships: list[dict] = []

            for table_name in inspector.get_table_names():
                columns = []
                primary_key = set(inspector.get_pk_constraint(table_name).get("constrained_columns", []))
                foreign_keys = inspector.get_foreign_keys(table_name)

                for column in inspector.get_columns(table_name):
                    columns.append(
                        {
                            "name": column["name"],
                            "type": str(column["type"]),
                            "nullable": column.get("nullable", True),
                            "default": column.get("default"),
                            "primary_key": column["name"] in primary_key,
                        }
                    )

                for foreign_key in foreign_keys:
                    if not foreign_key.get("referred_table"):
                        continue
                    relationships.append(
                        {
                            "source_table": table_name,
                            "source_columns": foreign_key.get("constrained_columns", []),
                            "target_table": foreign_key["referred_table"],
                            "target_columns": foreign_key.get("referred_columns", []),
                        }
                    )

                tables.append(
                    {
                        "table_name": table_name,
                        "columns": columns,
                        "primary_key": list(primary_key),
                        "foreign_keys": foreign_keys,
                    }
                )

            return {
                "dialect": engine.dialect.name,
                "tables": tables,
                "relationships": relationships,
            }
        except SQLAlchemyError as exc:
            raise DatabaseConnectionError(f"Could not inspect the database schema: {exc}") from exc

    def render_schema_for_prompt(self, snapshot: dict) -> str:
        lines = [f"Database dialect: {snapshot['dialect']}"]

        for table in snapshot["tables"]:
            lines.append(f"\nTable: {table['table_name']}")
            for column in table["columns"]:
                column_parts = [
                    column["name"],
                    column["type"],
                    "NULL" if column["nullable"] else "NOT NULL",
                ]
                if column["primary_key"]:
                    column_parts.append("PRIMARY KEY")
                if column["default"] is not None:
                    column_parts.append(f"default={column['default']}")
                lines.append(f"- {' | '.join(column_parts)}")

        if snapshot["relationships"]:
            lines.append("\nRelationships:")
            for relationship in snapshot["relationships"]:
                lines.append(
                    "- "
                    f"{relationship['source_table']}.{', '.join(relationship['source_columns'])} "
                    f"-> {relationship['target_table']}.{', '.join(relationship['target_columns'])}"
                )

        return "\n".join(lines)

