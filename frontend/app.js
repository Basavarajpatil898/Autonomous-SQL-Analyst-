const state = {
    chart: null,
    lastPayload: null,
    databaseUrl: null,
    databaseLabel: "Workspace MySQL",
    databaseDialect: "mysql",
};

const elements = {
    form: document.getElementById("queryForm"),
    question: document.getElementById("question"),
    apiBaseUrl: document.getElementById("apiBaseUrl"),
    databaseTarget: document.getElementById("databaseTarget"),
    mysqlConnectionFields: document.getElementById("mysqlConnectionFields"),
    sqliteConnectionFields: document.getElementById("sqliteConnectionFields"),
    dbHost: document.getElementById("dbHost"),
    dbPort: document.getElementById("dbPort"),
    dbName: document.getElementById("dbName"),
    dbUser: document.getElementById("dbUser"),
    dbPassword: document.getElementById("dbPassword"),
    sqlitePath: document.getElementById("sqlitePath"),
    connectDatabaseButton: document.getElementById("connectDatabaseButton"),
    maxRows: document.getElementById("maxRows"),
    retryButton: document.getElementById("retryButton"),
    loadingBadge: document.getElementById("loadingBadge"),
    statusMessage: document.getElementById("statusMessage"),
    statusBanner: document.getElementById("statusBanner"),
    insightPanel: document.getElementById("insightPanel"),
    insightHeadline: document.getElementById("insightHeadline"),
    insightDetail: document.getElementById("insightDetail"),
    providerValue: document.getElementById("providerValue"),
    rowCountValue: document.getElementById("rowCountValue"),
    columnCountValue: document.getElementById("columnCountValue"),
    chartTypeValue: document.getElementById("chartTypeValue"),
    chartPanel: document.getElementById("chartPanel"),
    chartMetric: document.getElementById("chartMetric"),
    chartReason: document.getElementById("chartReason"),
    chartEmptyState: document.getElementById("chartEmptyState"),
    sqlOutput: document.getElementById("sqlOutput"),
    tableContainer: document.getElementById("tableContainer"),
    traceContainer: document.getElementById("traceContainer"),
    serviceStatus: document.getElementById("serviceStatus"),
    connectionDetail: document.getElementById("connectionDetail"),
    connectionName: document.getElementById("connectionName"),
    connectionDot: document.getElementById("connectionDot"),
    tableCount: document.getElementById("tableCount"),
    copySqlButton: document.getElementById("copySqlButton"),
    connectionHelp: document.getElementById("connectionHelp"),
    connectionDialog: document.getElementById("connectionDialog"),
    schemaSummary: document.getElementById("schemaSummary"),
    schemaTables: document.getElementById("schemaTables"),
    schemaRelationships: document.getElementById("schemaRelationships"),
    schemaQuestionExamples: document.getElementById("schemaQuestionExamples"),
    refreshSchemaButton: document.getElementById("refreshSchemaButton"),
    sqlDialect: document.getElementById("sqlDialect"),
};

function getApiBaseUrl() {
    return elements.apiBaseUrl.value.trim().replace(/\/$/, "");
}

function setLoading(isLoading) {
    elements.loadingBadge.classList.toggle("hidden", !isLoading);
    elements.retryButton.disabled = isLoading || !state.lastPayload;
}

function setStatus(message, tone = "normal") {
    elements.statusMessage.textContent = message;
    elements.statusBanner.classList.toggle("tone-error", tone === "error");
    elements.statusBanner.classList.toggle("tone-success", tone === "success");
}

function updateServiceStatus(message, healthy) {
    elements.connectionName.textContent = state.databaseLabel;
    elements.connectionDetail.textContent = message;
    elements.connectionDot.style.background = healthy ? "#4b9a68" : "#d1a15d";
    elements.connectionDot.style.boxShadow = healthy
        ? "0 0 0 3px #eaf5ed"
        : "0 0 0 3px #f9f2e7";
}

function getSelectedDatabaseUrl() {
    const target = elements.databaseTarget.value;
    if (target === "configured") return null;

    if (target === "mysql") {
        const host = elements.dbHost.value.trim();
        const port = Number(elements.dbPort.value);
        const database = elements.dbName.value.trim();
        const username = elements.dbUser.value;
        const password = elements.dbPassword.value;
        if (!host || !database || !username || !Number.isInteger(port) || port < 1 || port > 65535) {
            throw new Error("Enter a MySQL host, valid port, database name, and username.");
        }
        if (/[\\/?#@\s]/.test(host)) throw new Error("Enter a host name or IP address without a URL path.");

        let parsedHost;
        try {
            parsedHost = new URL(`http://${host}:${port}`).host;
        } catch {
            throw new Error("The MySQL host or port is not valid.");
        }
        return `mysql+pymysql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${parsedHost}/${encodeURIComponent(database)}`;
    }

    const filePath = elements.sqlitePath.value.trim().replaceAll("\\", "/");
    if (!filePath || (!filePath.startsWith("/") && !/^[a-z]:\//i.test(filePath))) {
        throw new Error("Enter an absolute SQLite file path on the backend machine.");
    }
    return filePath.startsWith("/") ? `sqlite:////${filePath.slice(1)}` : `sqlite:///${filePath}`;
}

function updateDatabaseFields() {
    const target = elements.databaseTarget.value;
    elements.mysqlConnectionFields.classList.toggle("hidden", target !== "mysql");
    elements.sqliteConnectionFields.classList.toggle("hidden", target !== "sqlite");
}

async function connectSelectedDatabase() {
    elements.connectDatabaseButton.disabled = true;
    elements.connectDatabaseButton.textContent = "Checking connection…";
    try {
        const databaseUrl = getSelectedDatabaseUrl();
        const response = await fetch(`${getApiBaseUrl()}/query/schema`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ database_url: databaseUrl }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Could not connect to this database.");

        state.databaseUrl = databaseUrl;
        state.databaseLabel = elements.databaseTarget.value === "configured"
            ? "Workspace MySQL"
            : elements.databaseTarget.value === "mysql" ? elements.dbName.value.trim() : "SQLite";
        state.databaseDialect = data.dialect;
        elements.sqlDialect.textContent = data.dialect.toUpperCase();
        renderDatabaseSchema(data);
        updateServiceStatus(`${state.databaseLabel} · ${data.tables.length} tables`, true);
        setStatus(`Connected to ${state.databaseLabel}. ${data.tables.length} tables are available for analysis.`, "success");
        document.querySelector(".database-menu").open = false;
    } catch (error) {
        if (!state.schemaLoaded) {
            elements.schemaSummary.innerHTML = `<div class="schema-placeholder">${escapeHtml(error.message || "Could not inspect the database schema. Check the connection and try again.")}</div>`;
        }
        updateServiceStatus("Database unavailable", false);
        setStatus(error.message || "Could not reach the database. Check the connection details and try again.", "error");
    } finally {
        elements.connectDatabaseButton.disabled = false;
        elements.connectDatabaseButton.textContent = "Connect and inspect";
    }
}

function renderDatabaseSchema(schema) {
    state.schemaLoaded = true;
    elements.schemaSummary.innerHTML = `
        <span class="schema-stat">DATABASE <strong>${escapeHtml(schema.dialect.toUpperCase())}</strong></span>
        <span class="schema-stat">TABLES <strong>${schema.tables.length}</strong></span>
        <span class="schema-stat">RELATIONSHIPS <strong>${schema.relationships.length}</strong></span>
    `;

    if (!schema.tables.length) {
        elements.schemaTables.innerHTML = '<div class="schema-empty">This database has no visible tables yet.</div>';
    } else {
        elements.schemaTables.innerHTML = schema.tables.map((table) => {
            const foreignKeyColumns = new Set((table.foreign_keys || []).flatMap((key) => key.constrained_columns || []));
            const columns = table.columns.map((column) => `
                <div class="schema-column">
                    <span class="schema-column-name" title="${escapeHtml(column.name)}">${escapeHtml(column.name)}</span>
                    <span class="schema-column-type" title="${escapeHtml(column.type)}">${escapeHtml(column.type)}</span>
                    <span class="schema-key-badges">
                        ${column.primary_key ? '<span class="schema-key">PK</span>' : ""}
                        ${foreignKeyColumns.has(column.name) ? '<span class="schema-key schema-key-fk">FK</span>' : ""}
                        ${column.nullable ? '<span class="schema-nullable">NULL</span>' : ""}
                    </span>
                </div>
            `).join("");

            return `<article class="schema-table-card"><header class="schema-table-heading"><strong>${escapeHtml(table.table_name)}</strong><span>${table.columns.length} columns</span></header><div class="schema-columns">${columns}</div></article>`;
        }).join("");
    }

    if (!schema.relationships.length) {
        elements.schemaRelationships.classList.add("hidden");
        elements.schemaRelationships.innerHTML = "";
    } else {
        const relationships = schema.relationships.map((relationship) => `
            <span class="schema-relation">${escapeHtml(relationship.source_table)}.${escapeHtml((relationship.source_columns || []).join(", "))}
                <span class="schema-relation-arrow">→</span>
                ${escapeHtml(relationship.target_table)}.${escapeHtml((relationship.target_columns || []).join(", "))}</span>
        `).join("");
        elements.schemaRelationships.innerHTML = `<span class="schema-relationships-title">TABLE RELATIONSHIPS</span>${relationships}`;
        elements.schemaRelationships.classList.remove("hidden");
    }

    renderSchemaQuestionExamples(schema);
}

function renderSchemaQuestionExamples(schema) {
    const examples = [];
    const addExample = (question) => {
        if (question && !examples.includes(question)) examples.push(question);
    };

    for (const table of schema.tables) {
        const tableName = `\`${table.table_name}\``;
        const columns = table.columns || [];
        const dimensions = columns.filter((column) => /char|text|enum|clob/i.test(column.type) && !/(^|_)(name|email|address|description)(_|$)/i.test(column.name));
        const preferredDimension = dimensions.find((column) => /category|status|type|city|region|country|segment|group|department|priority|channel/i.test(column.name)) || dimensions[0];
        const metric = columns.find((column) => !column.primary_key && !/(^|_)(id|count)(_|$)/i.test(column.name) && /int|decimal|numeric|float|double|real|money/i.test(column.type));
        const dateColumn = columns.find((column) => /date|time|year/i.test(column.type));

        addExample(`Count the records in the ${tableName} table.`);
        if (metric && preferredDimension) {
            addExample(`Compare ${metric.name} across ${preferredDimension.name} in ${tableName}.`);
        } else if (preferredDimension) {
            addExample(`Count ${tableName} records by ${preferredDimension.name}.`);
        }
        if (dateColumn) addExample(`Show ${tableName} records over time using ${dateColumn.name}.`);
        if (metric && examples.length < 4) addExample(`Find the 10 ${tableName} records with the highest ${metric.name}.`);
        if (examples.length >= 5) break;
    }

    const relationship = schema.relationships[0];
    if (relationship) {
        addExample(`Show ${relationship.source_table} with matching ${relationship.target_table} details.`);
    }

    if (!examples.length) {
        elements.schemaQuestionExamples.innerHTML = '<span class="schema-placeholder">No tables are available to build examples. Add tables or check your database permissions.</span>';
        return;
    }

    elements.schemaQuestionExamples.innerHTML = examples.slice(0, 6).map((question) => `
        <button type="button" class="schema-question-example" data-question="${escapeHtml(question)}">${escapeHtml(question)}</button>
    `).join("");
}

function destroyChart() {
    if (state.chart) {
        state.chart.destroy();
        state.chart = null;
    }
}

function renderTable(rows) {
    elements.tableCount.textContent = `${rows.length} ${rows.length === 1 ? "row" : "rows"}`;
    if (!rows.length) {
        elements.tableContainer.innerHTML = '<div class="empty-state">The query succeeded but returned no rows.</div>';
        return;
    }

    const columns = Object.keys(rows[0]);
    const header = columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
    const body = rows
        .map((row) => {
            const cells = columns
                .map((column) => `<td>${escapeHtml(formatCellValue(row[column]))}</td>`)
                .join("");
            return `<tr>${cells}</tr>`;
        })
        .join("");

    elements.tableContainer.innerHTML = `
        <table>
            <thead><tr>${header}</tr></thead>
            <tbody>${body}</tbody>
        </table>
    `;
}

function renderTrace(attempts, finalSql) {
    if (!attempts.length) {
        elements.traceContainer.innerHTML = '<div class="empty-state">No attempts were recorded.</div>';
        return;
    }

    const items = attempts
        .map((attempt) => {
            const success = !attempt.error && attempt.sql === finalSql;
            return `
                <article class="trace-item ${success ? "success" : "error"}">
                    <div class="trace-meta">
                        <span>${escapeHtml(attempt.provider.toUpperCase())} attempt ${attempt.attempt_number}</span>
                        <span>${success ? "Executed successfully" : "Recovery step"}</span>
                    </div>
                    <div class="trace-sql">${escapeHtml(attempt.sql || "No SQL captured.")}</div>
                    ${attempt.error ? `<div class="trace-error">${escapeHtml(attempt.error)}</div>` : ""}
                </article>
            `;
        })
        .join("");

    elements.traceContainer.innerHTML = `<div class="trace-list">${items}</div>`;
}

function renderFailureTrace(details) {
    if (!details || !Array.isArray(details.attempts) || !details.attempts.length) {
        elements.traceContainer.innerHTML = '<div class="empty-state">No recovery trace was returned for this failure.</div>';
        return;
    }

    renderTrace(details.attempts, details.failed_sql || "");
}

function renderChart(response) {
    destroyChart();

    const { rows, visualization } = response;
    const hasUsefulChart = visualization.enabled
        && rows.length >= 2
        && visualization.x_field
        && visualization.y_fields.length > 0
        && rows.every((row) => visualization.x_field in row)
        && visualization.y_fields.every((field) => rows.every((row) => {
            const value = row[field];
            return typeof value === "number" && Number.isFinite(value);
        }))
        && new Set(rows.map((row) => String(row[visualization.x_field]))).size > 1;

    elements.chartPanel.classList.toggle("hidden", !hasUsefulChart);
    elements.chartMetric.classList.toggle("hidden", !hasUsefulChart);

    if (!hasUsefulChart) {
        elements.chartTypeValue.textContent = "—";
        return;
    }

    const labels = rows.map((row) => row[visualization.x_field]);
    const palette = ["#0d7a6e", "#d97745", "#2f5a7c", "#8f6f32", "#6a846f"];
    // The backend decides which chart suits the result; the client only maps that plan into Chart.js.
    const datasets = visualization.y_fields.map((field, index) => {
        const sharedConfig = {
            label: field,
            data: rows.map((row) => row[field]),
            borderColor: palette[index % palette.length],
            borderWidth: 2,
            tension: 0.3,
        };

        if (visualization.chart_type === "pie") {
            return {
                ...sharedConfig,
                backgroundColor: rows.map((_, rowIndex) => palette[rowIndex % palette.length]),
            };
        }

        return {
            ...sharedConfig,
            backgroundColor: palette[index % palette.length],
        };
    });

    elements.chartEmptyState.classList.add("hidden");
    elements.chartTypeValue.textContent = visualization.chart_type;
    elements.chartReason.textContent = visualization.reasoning;

    if (typeof Chart === "undefined") {
        elements.chartEmptyState.classList.remove("hidden");
        elements.chartEmptyState.innerHTML = '<span class="empty-illustration">▥</span><strong>Chart library unavailable</strong><span>Your data is still available in the table and SQL query.</span>';
        return;
    }

    state.chart = new Chart(document.getElementById("resultChart"), {
        type: visualization.chart_type,
        data: {
            labels,
            datasets,
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: visualization.chart_type !== "pie",
                },
                title: {
                    display: Boolean(visualization.title),
                    text: visualization.title,
                },
            },
            scales: visualization.chart_type === "pie"
                ? {}
                : {
                    y: {
                        beginAtZero: true,
                    },
                },
        },
    });
}

function renderResponse(response) {
    elements.providerValue.textContent = response.provider_used.toUpperCase();
    elements.rowCountValue.textContent = response.metadata.row_count;
    elements.columnCountValue.textContent = response.metadata.column_count;
    elements.sqlOutput.textContent = response.sql;
    const chartAvailable = isUsefulVisualization(response);
    setStatus(
        response.metadata.truncated
            ? `Analysis complete. Showing the first ${response.metadata.row_count} rows; the result was capped at your requested limit.${chartAvailable ? " A chart is available below." : " The results are best shown as a table."}`
            : `Analysis complete. ${response.metadata.row_count} ${response.metadata.row_count === 1 ? "row" : "rows"} returned. ${chartAvailable ? "A chart and table are available below." : "These results are best shown as a table."}`,
        "success",
    );

    renderTable(response.rows);
    renderTrace(response.attempts, response.sql);
    renderChart(response);
    renderInsights(response);
}

function formatInsightNumber(value) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function renderInsights(response) {
    const { rows, metadata } = response;
    elements.insightPanel.classList.add("hidden");
    elements.insightHeadline.textContent = "";
    elements.insightDetail.textContent = "";

    // Partial result sets and detail rows do not support reliable aggregate takeaways.
    if (metadata.truncated || rows.length < 2) return;

    const numericColumns = metadata.columns.filter((column) => column.is_numeric);
    const temporalColumn = metadata.columns.find((column) => column.is_temporal);
    let insight = null;

    const isGroupedTimeSeries = temporalColumn
        && response.visualization?.chart_type === "line"
        && response.visualization?.x_field === temporalColumn.name
        && /\bgroup\s+by\b/i.test(response.sql);

    if (isGroupedTimeSeries && numericColumns.length) {
        const metric = response.visualization.y_fields.find((field) => numericColumns.some((column) => column.name === field));
        if (!metric) return;
        const points = rows
            .map((row) => ({ label: row[temporalColumn.name], date: new Date(row[temporalColumn.name]), value: row[metric] }))
            .filter((point) => Number.isFinite(point.date.getTime()) && typeof point.value === "number" && Number.isFinite(point.value))
            .sort((left, right) => left.date - right.date);
        const uniquePeriods = new Set(points.map((point) => point.date.getTime()));

        if (points.length >= 3 && uniquePeriods.size === points.length) {
            const first = points[0];
            const last = points.at(-1);
            const difference = last.value - first.value;
            const metricLabel = metric.replaceAll("_", " ");
            if (difference !== 0) {
                const direction = difference > 0 ? "rose" : "fell";
                const percent = first.value > 0 ? ` (${formatInsightNumber(Math.abs(difference / first.value) * 100)}%)` : "";
                const firstDate = first.date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
                const lastDate = last.date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
                insight = {
                    headline: `${metricLabel} ${direction} by ${formatInsightNumber(Math.abs(difference))}${percent} between ${firstDate} and ${lastDate}.`,
                    detail: `This is the net change across ${points.length} grouped periods, from ${formatInsightNumber(first.value)} to ${formatInsightNumber(last.value)}.`,
                };
            }
        }
    }

    if (!insight && numericColumns.length) {
        const categoricalColumn = metadata.columns.find((column) => column.is_categorical);
        const metric = numericColumns.find((column) => rows.some((row) => typeof row[column.name] === "number" && Number.isFinite(row[column.name])));
        if (categoricalColumn && metric) {
            const ranked = rows
                .filter((row) => row[categoricalColumn.name] !== null && row[categoricalColumn.name] !== undefined && typeof row[metric.name] === "number" && Number.isFinite(row[metric.name]))
                .sort((left, right) => right[metric.name] - left[metric.name]);
            const labels = ranked.map((row) => String(row[categoricalColumn.name]));
            const valuesAreComparable = ranked.every((row) => row[metric.name] >= 0);
            const labelsAreUnique = new Set(labels).size === labels.length;

            if (ranked.length >= 2 && labelsAreUnique && valuesAreComparable && ranked[0][metric.name] > ranked[1][metric.name]) {
                const [leader, runnerUp] = ranked;
                const gap = leader[metric.name] - runnerUp[metric.name];
                const metricLabel = metric.name.replaceAll("_", " ");
                const percent = runnerUp[metric.name] > 0
                    ? ` (${formatInsightNumber(gap / runnerUp[metric.name] * 100)}% higher)`
                    : "";
                insight = {
                    headline: `${leader[categoricalColumn.name]} has the highest ${metricLabel}: ${formatInsightNumber(leader[metric.name])}.`,
                    detail: `That is ${formatInsightNumber(gap)}${percent} above ${runnerUp[categoricalColumn.name]} (${formatInsightNumber(runnerUp[metric.name])}), among ${ranked.length} distinct groups returned.`,
                };
            }
        }
    }

    if (insight) {
        elements.insightHeadline.textContent = insight.headline;
        elements.insightDetail.textContent = insight.detail;
        elements.insightPanel.classList.remove("hidden");
    } else {
        elements.insightHeadline.textContent = "";
        elements.insightDetail.textContent = "";
        elements.insightPanel.classList.add("hidden");
    }
}

function isUsefulVisualization(response) {
    const visualization = response.visualization;
    const rows = response.rows;
    if (!visualization?.enabled || rows.length < 2 || !visualization.x_field || !visualization.y_fields?.length) return false;
    if (!rows.every((row) => visualization.x_field in row)) return false;
    if (!visualization.y_fields.every((field) => rows.every((row) => typeof row[field] === "number" && Number.isFinite(row[field])))) return false;
    return new Set(rows.map((row) => String(row[visualization.x_field]))).size > 1;
}

function resetResults() {
    destroyChart();
    elements.providerValue.textContent = "—";
    elements.rowCountValue.textContent = "—";
    elements.columnCountValue.textContent = "—";
    elements.chartTypeValue.textContent = "—";
    elements.insightPanel.classList.add("hidden");
    elements.insightHeadline.textContent = "";
    elements.insightDetail.textContent = "";
    elements.chartPanel.classList.add("hidden");
    elements.chartMetric.classList.add("hidden");
    elements.chartReason.textContent = "A chart will appear when your query returns data.";
    elements.sqlOutput.innerHTML = "<code>-- Your generated SQL will appear here</code>";
    elements.tableCount.textContent = "Waiting for results";
    elements.tableContainer.innerHTML = '<div class="empty-state table-empty"><span class="empty-illustration">▤</span><strong>Nothing to show yet</strong><span>Your data will appear here after analysis.</span></div>';
    elements.traceContainer.innerHTML = '<div class="trace-placeholder">Activity will appear after you run an analysis.</div>';
    elements.chartEmptyState.classList.remove("hidden");
    elements.chartEmptyState.innerHTML = '<span class="empty-illustration">▥</span><strong>Your chart will show up here</strong><span>Ask a question involving a category or a trend.</span>';
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function formatCellValue(value) {
    if (value === null || value === undefined) {
        return "null";
    }
    if (typeof value === "object") {
        return JSON.stringify(value);
    }
    return String(value);
}

async function submitQuery(payload) {
    state.lastPayload = payload;
    payload.database_url = state.databaseUrl;
    elements.retryButton.disabled = false;
    setLoading(true);
    setStatus("Reading your question, building a safe SQL query, and fetching results…");

    try {
        const response = await fetch(`${getApiBaseUrl()}/query`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        let data;
        try {
            data = await response.json();
        } catch {
            throw new Error(`The server returned an unreadable response (HTTP ${response.status}). Check that the configured API URL points to the backend.`);
        }
        if (!response.ok) {
            const error = new Error(describeApiError(data));
            error.details = data.details;
            throw error;
        }

        renderResponse(data);
    } catch (error) {
        resetResults();
        renderFailureTrace(error.details);
        const message = error instanceof TypeError
            ? `Could not reach the API at ${getApiBaseUrl()}. Make sure the backend is running and the API URL in Settings is correct.`
            : error.message;
        setStatus(message, "error");
    } finally {
        setLoading(false);
    }
}

async function checkBackendHealth() {
    try {
        const response = await fetch(`${getApiBaseUrl()}/health`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error();
        }

        return true;
    } catch {
        return false;
    }
}

function describeApiError(data) {
    const details = data?.details || {};
    const errorText = [data?.message, details.last_error, details.error, details.database_error]
        .filter(Boolean)
        .join(" ");
    const lower = errorText.toLowerCase();

    if (lower.includes("access denied")) {
        return "MySQL is running, but it rejected the configured username or password. Update DATABASE_URL in backend/.env to match a MySQL account, then restart the backend. If the demo account has not been created, initialize the database with an administrator account first.";
    }
    if (lower.includes("can't connect to mysql") || lower.includes("unknown database") || lower.includes("connection refused") || lower.includes("2003")) {
        return "The database connection failed. Check that MySQL is running, the sample database exists, and DATABASE_URL in backend/.env matches your local MySQL setup.";
    }
    if (lower.includes("ollama") && (lower.includes("connect") || lower.includes("refused") || lower.includes("not found"))) {
        return "The backend could not reach Ollama. Start Ollama and download the model configured in backend/.env, or add a valid Gemini API key for fallback.";
    }
    if (lower.includes("gemini_api_key") || lower.includes("api key not valid")) {
        return "Gemini fallback is not configured. Add a valid GEMINI_API_KEY to backend/.env, or make sure your local Ollama model is running.";
    }
    if (lower.includes("no such table") || lower.includes("doesn't exist") || lower.includes("does not exist")) {
        return "The query references a table that MySQL cannot find. Load the schema from database/init.sql or check that the configured database contains the expected tables.";
    }
    if (lower.includes("exhausted all recovery attempts")) {
        return "The AI providers could not create a query that ran successfully. Check that Ollama is available and that the database connection works, then retry.";
    }
    return data?.message || "The request failed. Check the backend logs and connection settings, then try again.";
}

elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitQuery({
        question: elements.question.value.trim(),
        max_rows: Number(elements.maxRows.value),
    });
});

elements.retryButton.addEventListener("click", async () => {
    if (state.lastPayload) {
        await submitQuery(state.lastPayload);
    }
});

document.querySelectorAll(".example-card").forEach((button) => {
    button.addEventListener("click", () => {
        elements.question.value = button.dataset.sample;
        elements.question.focus();
        elements.question.scrollIntoView({ behavior: "smooth", block: "center" });
    });
});

elements.schemaQuestionExamples.addEventListener("click", (event) => {
    const button = event.target.closest(".schema-question-example");
    if (!button) return;
    elements.question.value = button.dataset.question;
    elements.question.focus();
    elements.question.scrollIntoView({ behavior: "smooth", block: "center" });
});

elements.apiBaseUrl.addEventListener("change", () => {
    checkBackendHealth();
    connectSelectedDatabase();
});
elements.databaseTarget.addEventListener("change", updateDatabaseFields);
elements.connectDatabaseButton.addEventListener("click", connectSelectedDatabase);
elements.refreshSchemaButton.addEventListener("click", connectSelectedDatabase);
elements.copySqlButton.addEventListener("click", async () => {
    const sql = elements.sqlOutput.textContent.trim();
    if (!sql || sql.startsWith("-- Your generated SQL")) return;

    try {
        await navigator.clipboard.writeText(sql);
        elements.copySqlButton.textContent = "✓";
        window.setTimeout(() => { elements.copySqlButton.textContent = "▢"; }, 1400);
    } catch {
        setStatus("Your browser blocked clipboard access. Select the SQL query and copy it manually.", "error");
    }
});
elements.connectionHelp.addEventListener("click", () => elements.connectionDialog.showModal());
elements.connectionDialog.addEventListener("click", (event) => {
    if (event.target === elements.connectionDialog) elements.connectionDialog.close();
});

document.querySelectorAll('.nav-item[href^="#"]').forEach((link) => {
    link.addEventListener("click", () => {
        document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("nav-item-active"));
        link.classList.add("nav-item-active");
    });
});

resetResults();
checkBackendHealth();
updateDatabaseFields();
connectSelectedDatabase();
