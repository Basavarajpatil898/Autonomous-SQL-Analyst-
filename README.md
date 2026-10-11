# Autonomous SQL Analyst

Autonomous SQL Analyst is a full-stack AI-powered web application that lets users query a relational database with natural language, automatically repairs bad SQL, executes the corrected query, and returns both tabular results and a recommended visualization.

The stack is split into a FastAPI backend and a static frontend:

- `backend/`: FastAPI API, LangChain prompt orchestration, Ollama primary provider, Gemini fallback, SQLAlchemy schema inspection, autonomous SQL repair pipeline.
- `frontend/`: HTML, CSS, and JavaScript interface with Chart.js rendering, retry flow, SQL trace display, and backend status checks.
- `database/`: Sample MySQL schema and seed data for a quick end-to-end demo.

## Core flow

1. The user submits a plain-English analytics question.
2. The backend introspects the live database schema with SQLAlchemy.
3. LangChain injects that schema into the prompt for Ollama.
4. The generated SQL is validated as read-only and executed.
5. If execution fails, the backend recursively asks the model to repair the SQL using the error message.
6. After the configured Ollama retries are exhausted, the pipeline falls back to Gemini (`gemini-2.5-flash`).
7. The API returns rows, metadata, generated SQL, visualization hints, and the full recovery trace.

## Project structure

```text
.
|-- backend
|   |-- app
|   |   |-- api
|   |   |-- core
|   |   |-- db
|   |   |-- models
|   |   `-- services
|   |-- .env.example
|   |-- Dockerfile
|   `-- requirements.txt
|-- database
|   `-- init.sql
|-- frontend
|   |-- app.js
|   |-- index.html
|   |-- styles.css
|   |-- server.py
|   |-- Dockerfile
|   `-- nginx.conf
`-- docker-compose.yml
```

## Backend features

- FastAPI endpoints for health checks, schema inspection, and query execution
- LangChain-driven SQL generation and SQL repair chains
- Ollama primary LLM with Gemini fallback after repeated failures
- SQLAlchemy schema extraction with tables, columns, primary keys, and foreign keys
- Read-only SQL enforcement to block mutating statements
- Automatic result metadata generation:
  `row_count`, `column_count`, `truncated`, and inferred column types
- Backend chart recommendation logic for `bar`, `line`, `pie`, and `scatter`

## Frontend features

- Natural-language query form with sample prompts
- Loading state, retry button, backend health indicator, and inline error handling
- Automatic table rendering from JSON rows
- Chart.js visualization driven by backend chart recommendations
- Recovery trace view so users can inspect model attempts and SQL corrections

## Environment setup

### 1. Create the Python environment

From `backend/`:

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure environment variables

Copy `backend/.env.example` to `backend/.env` and update:

- `DATABASE_URL`: SQLAlchemy connection string for your MySQL database
- `OLLAMA_BASE_URL`: usually `http://127.0.0.1:11434`
- `OLLAMA_MODEL`: usually `llama3`
- `GEMINI_API_KEY`: required only if you want online fallback

Example:

```env
DATABASE_URL=mysql+pymysql://sql_analyst:sql_analyst@127.0.0.1:3306/autonomous_sql_analyst
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3
GEMINI_API_KEY=your_google_ai_studio_key
GEMINI_MODEL=gemini-2.5-flash
```

### 3. Start Ollama locally

Install Ollama, then:

```powershell
ollama serve
ollama pull llama3
```

### 4. Prepare MySQL

Create a database and load the demo schema from `database/init.sql`, or point `DATABASE_URL` at an existing schema.

Example with MySQL CLI:

```powershell
mysql -u root -p < ..\database\init.sql
```

## Running the application

### Local development

Start the backend from `backend/`:

```powershell
.venv\Scripts\activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Start the frontend from `frontend/`:

```powershell
python server.py
```

Open [http://127.0.0.1:5500](http://127.0.0.1:5500).

### Docker Compose

The included `docker-compose.yml` starts MySQL, the FastAPI backend, and the frontend.

Before running compose, export `GEMINI_API_KEY` in your shell if you want fallback enabled. Then:

```powershell
docker compose up --build
```

Services:

- Frontend: `http://127.0.0.1:5500`
- Backend: `http://127.0.0.1:8000`
- API docs: `http://127.0.0.1:8000/docs`

## API endpoints

- `GET /api/v1/health`
- `POST /api/v1/query`
- `GET /api/v1/query/schema`

Example request:

```json
{
  "question": "Show total revenue by product category.",
  "max_rows": 50
}
```

Example response shape:

```json
{
  "question": "Show total revenue by product category.",
  "sql": "SELECT p.category, SUM(oi.line_total) AS revenue ... LIMIT 50",
  "provider_used": "ollama",
  "rows": [
    {
      "category": "Software",
      "revenue": 1841.0
    }
  ],
  "metadata": {
    "row_count": 3,
    "column_count": 2,
    "truncated": false,
    "columns": []
  },
  "visualization": {
    "enabled": true,
    "chart_type": "bar",
    "x_field": "category",
    "y_fields": ["revenue"],
    "title": "revenue by category",
    "reasoning": "A categorical grouping with one numeric metric maps well to a pie or bar chart."
  },
  "attempts": []
}
```

## Notes for production hardening

- Store `DATABASE_URL` and `GEMINI_API_KEY` in your deployment secret manager, not in source control.
- Use a database account with read-only permissions for runtime querying.
- Tighten CORS origins in `backend/.env`.
- Put the backend behind a reverse proxy and enable HTTPS.
- Add request authentication and audit logging before exposing the service to untrusted users.
