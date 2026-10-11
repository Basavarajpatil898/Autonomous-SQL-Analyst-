from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate


SQL_GENERATION_SYSTEM_PROMPT = """
You are an expert SQL analyst.
Generate one syntactically correct, read-only SQL query for the user's request.

Rules:
- Return SQL only. Do not add markdown fences or explanations.
- Use only SELECT statements or CTEs that end in a SELECT.
- Never generate INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, or GRANT statements.
- Use the provided schema exactly as written.
- Prefer explicit JOINs using the supplied foreign key relationships.
- Respect the target SQL dialect.
- Keep the result focused and include a LIMIT clause that does not exceed {max_rows}.
""".strip()


SQL_REPAIR_SYSTEM_PROMPT = """
You are fixing a SQL query after a database execution failure.

Rules:
- Return SQL only. Do not add markdown fences or explanations.
- Keep the query read-only and compatible with the target SQL dialect.
- Use the database error message to repair the failed SQL.
- Keep the user's analytical intent unchanged.
- Include a LIMIT clause that does not exceed {max_rows}.
""".strip()


def build_generation_chain(llm):
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", SQL_GENERATION_SYSTEM_PROMPT),
            (
                "human",
                """
User question:
{question}

Database schema:
{schema_context}

Target dialect: {dialect}
Maximum rows: {max_rows}
""".strip(),
            ),
        ]
    )
    return prompt | llm | StrOutputParser()


def build_repair_chain(llm):
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", SQL_REPAIR_SYSTEM_PROMPT),
            (
                "human",
                """
Original user question:
{question}

Failed SQL:
{failed_sql}

Database error:
{error_message}

Database schema:
{schema_context}

Target dialect: {dialect}
Maximum rows: {max_rows}
""".strip(),
            ),
        ]
    )
    return prompt | llm | StrOutputParser()

