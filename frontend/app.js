const state = {
    chart: null,
    lastPayload: null,
};

const elements = {
    form: document.getElementById("queryForm"),
    question: document.getElementById("question"),
    apiBaseUrl: document.getElementById("apiBaseUrl"),
    maxRows: document.getElementById("maxRows"),
    retryButton: document.getElementById("retryButton"),
    loadingBadge: document.getElementById("loadingBadge"),
    statusMessage: document.getElementById("statusMessage"),
    providerValue: document.getElementById("providerValue"),
    rowCountValue: document.getElementById("rowCountValue"),
    columnCountValue: document.getElementById("columnCountValue"),
    chartTypeValue: document.getElementById("chartTypeValue"),
    chartReason: document.getElementById("chartReason"),
    chartEmptyState: document.getElementById("chartEmptyState"),
    sqlOutput: document.getElementById("sqlOutput"),
    tableContainer: document.getElementById("tableContainer"),
    traceContainer: document.getElementById("traceContainer"),
    serviceStatus: document.getElementById("serviceStatus"),
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
    elements.statusMessage.style.color = tone === "error" ? "var(--danger)" : "var(--text-soft)";
}

function updateServiceStatus(message, healthy) {
    const dot = elements.serviceStatus.querySelector(".status-dot");
    elements.serviceStatus.lastElementChild.textContent = message;
    dot.style.background = healthy ? "var(--accent)" : "var(--accent-warm)";
    dot.style.boxShadow = healthy
        ? "0 0 0 6px rgba(13, 122, 110, 0.16)"
        : "0 0 0 6px rgba(217, 119, 69, 0.16)";
}

function destroyChart() {
    if (state.chart) {
        state.chart.destroy();
        state.chart = null;
    }
}

function renderTable(rows) {
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
    if (!visualization.enabled || !rows.length) {
        elements.chartTypeValue.textContent = "Table";
        elements.chartReason.textContent = visualization.reasoning;
        elements.chartEmptyState.classList.remove("hidden");
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
    setStatus(
        response.metadata.truncated
            ? "Query succeeded. Rows were truncated to the requested maximum."
            : "Query succeeded and results are ready.",
    );

    renderTable(response.rows);
    renderTrace(response.attempts, response.sql);
    renderChart(response);
}

function resetResults() {
    destroyChart();
    elements.providerValue.textContent = "-";
    elements.rowCountValue.textContent = "0";
    elements.columnCountValue.textContent = "0";
    elements.chartTypeValue.textContent = "Table";
    elements.chartReason.textContent = "No chart selected yet.";
    elements.sqlOutput.textContent = "-- waiting for a query";
    elements.tableContainer.innerHTML = '<div class="empty-state">Rows will appear here after the backend executes a query.</div>';
    elements.traceContainer.innerHTML = '<div class="empty-state">Attempt history will appear after execution.</div>';
    elements.chartEmptyState.classList.remove("hidden");
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
    elements.retryButton.disabled = false;
    setLoading(true);
    setStatus("Generating SQL, executing it, and applying recovery if needed...");

    try {
        const response = await fetch(`${getApiBaseUrl()}/query`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (!response.ok) {
            const error = new Error(data.message || "Request failed.");
            error.details = data.details;
            throw error;
        }

        renderResponse(data);
    } catch (error) {
        resetResults();
        renderFailureTrace(error.details);
        setStatus(error.message, "error");
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

        updateServiceStatus(
            `${data.status.toUpperCase()} | Ollama: ${data.ollama_model} | Gemini fallback: ${data.gemini_fallback_enabled ? "on" : "off"}`,
            true,
        );
    } catch {
        updateServiceStatus("Backend unavailable at the configured API URL", false);
    }
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

document.querySelectorAll(".sample-chip").forEach((button) => {
    button.addEventListener("click", () => {
        elements.question.value = button.dataset.sample;
        elements.question.focus();
    });
});

elements.apiBaseUrl.addEventListener("change", checkBackendHealth);

resetResults();
checkBackendHealth();
