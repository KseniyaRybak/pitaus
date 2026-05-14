import * as duckdb from "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.5.2/+esm";

const DATA_URL = "./data/abortions_long.parquet";
const SERVICE_VALUE = 9999999;

const elements = {
  statusDot: document.querySelector("#statusDot"),
  statusTitle: document.querySelector("#statusTitle"),
  statusText: document.querySelector("#statusText"),
  indicator: document.querySelector("#indicatorFilter"),
  object: document.querySelector("#objectFilter"),
  organization: document.querySelector("#organizationFilter"),
  group: document.querySelector("#groupFilter"),
  age: document.querySelector("#ageFilter"),
  duration: document.querySelector("#durationFilter"),
  showServiceValues: document.querySelector("#showServiceValues"),
  resetFilters: document.querySelector("#resetFilters"),
  latestValue: document.querySelector("#latestValue"),
  latestYear: document.querySelector("#latestYear"),
  yearChange: document.querySelector("#yearChange"),
  yearChangeCaption: document.querySelector("#yearChangeCaption"),
  regionRank: document.querySelector("#regionRank"),
  regionRankCaption: document.querySelector("#regionRankCaption"),
  pointsCount: document.querySelector("#pointsCount"),
  trendCaption: document.querySelector("#trendCaption"),
  regionsCaption: document.querySelector("#regionsCaption"),
  ageCaption: document.querySelector("#ageCaption"),
  previewTable: document.querySelector("#previewTable")
};

const state = {
  db: null,
  conn: null,
  defaults: {},
  loading: false
};

const plotConfig = {
  responsive: true,
  displayModeBar: false
};

function setStatus(kind, title, text) {
  elements.statusDot.className = `status-dot ${kind === "ready" ? "ready" : kind === "error" ? "error" : ""}`;
  elements.statusTitle.textContent = title;
  elements.statusText.textContent = text;
}

function escapeSql(value) {
  return String(value).replaceAll("'", "''");
}

function literal(value) {
  return `'${escapeSql(value)}'`;
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Number(value));
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value)}%`;
}

function normalizeRows(table) {
  return table.toArray().map((row) => {
    const clean = {};
    for (const [key, value] of Object.entries(row)) {
      clean[key] = typeof value === "bigint" ? Number(value) : value;
    }
    return clean;
  });
}

async function query(sql) {
  const result = await state.conn.query(sql);
  return normalizeRows(result);
}

function fillSelect(select, values, preferred = "Всего") {
  select.replaceChildren();
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  });

  const preferredValue = values.includes(preferred) ? preferred : values[0];
  if (preferredValue) select.value = preferredValue;
  return preferredValue;
}

function selectedFilters({ skipAge = false } = {}) {
  const filters = [
    `indicator_name = ${literal(elements.indicator.value)}`,
    `object_name = ${literal(elements.object.value)}`,
    `organization_type = ${literal(elements.organization.value)}`,
    `"group" = ${literal(elements.group.value)}`,
    `pregnancy_duration = ${literal(elements.duration.value)}`
  ];

  if (!skipAge) {
    filters.push(`age = ${literal(elements.age.value)}`);
  }

  if (!elements.showServiceValues.checked) {
    filters.push(`TRY_CAST(indicator_value AS DOUBLE) IS NOT NULL`);
    filters.push(`TRY_CAST(indicator_value AS DOUBLE) <> ${SERVICE_VALUE}`);
  }

  return filters.join(" AND ");
}

function chartLayout(title = "") {
  return {
    title: title ? { text: title, x: 0, xanchor: "left", font: { size: 14 } } : undefined,
    margin: { t: title ? 44 : 18, r: 22, b: 54, l: 74 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "Inter, ui-sans-serif, system-ui", color: "#111827" },
    xaxis: {
      gridcolor: "rgba(17,24,39,0.08)",
      zerolinecolor: "rgba(17,24,39,0.08)"
    },
    yaxis: {
      gridcolor: "rgba(17,24,39,0.08)",
      zerolinecolor: "rgba(17,24,39,0.08)",
      tickformat: ",.0f"
    },
    hoverlabel: { align: "left" }
  };
}

function renderEmptyChart(targetId) {
  const target = document.querySelector(`#${targetId}`);
  const template = document.querySelector("#emptyStateTemplate");
  target.replaceChildren(template.content.cloneNode(true));
}

function renderTrend(rows) {
  if (!rows.length) return renderEmptyChart("trendChart");

  Plotly.newPlot("trendChart", [{
    x: rows.map((row) => row.year),
    y: rows.map((row) => row.value),
    type: "scatter",
    mode: "lines+markers",
    line: { width: 3 },
    marker: { size: 8 },
    hovertemplate: "Год: %{x}<br>Значение: %{y:,.2f}<extra></extra>"
  }], chartLayout(), plotConfig);
}

function renderRegions(rows, latestYear) {
  if (!rows.length) return renderEmptyChart("regionsChart");

  Plotly.newPlot("regionsChart", [{
    x: rows.map((row) => row.value).reverse(),
    y: rows.map((row) => row.object_name).reverse(),
    type: "bar",
    orientation: "h",
    hovertemplate: "%{y}<br>%{x:,.2f}<extra></extra>"
  }], {
    ...chartLayout(),
    margin: { t: 18, r: 18, b: 48, l: 190 },
    yaxis: {
      automargin: true,
      gridcolor: "rgba(17,24,39,0.08)"
    }
  }, plotConfig);

  elements.regionsCaption.textContent = `Последний доступный год: ${latestYear}.`;
}

function renderAgeBreakdown(rows, latestYear) {
  if (!rows.length) return renderEmptyChart("ageChart");

  Plotly.newPlot("ageChart", [{
    labels: rows.map((row) => row.age),
    values: rows.map((row) => row.value),
    type: "pie",
    hole: 0.56,
    textinfo: "label+percent",
    hovertemplate: "%{label}<br>%{value:,.2f}<extra></extra>"
  }], {
    ...chartLayout(),
    margin: { t: 18, r: 18, b: 18, l: 18 },
    showlegend: false
  }, plotConfig);

  elements.ageCaption.textContent = `Структура за ${latestYear} год.`;
}

function renderPreview(rows) {
  elements.previewTable.replaceChildren();
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.year ?? "-"}</td>
      <td>${formatNumber(row.indicator_value)}</td>
      <td>${row.source ?? "-"}</td>
      <td>${row.comment ?? "-"}</td>
    `;
    elements.previewTable.append(tr);
  });
}

function updateKpis(trendRows, regionRows, latestYear) {
  elements.pointsCount.textContent = formatNumber(trendRows.length);

  if (!trendRows.length) {
    elements.latestValue.textContent = "-";
    elements.latestYear.textContent = "-";
    elements.yearChange.textContent = "-";
    elements.yearChangeCaption.textContent = "Нет наблюдений";
    elements.regionRank.textContent = "-";
    elements.regionRankCaption.textContent = "Нет рейтинга";
    return;
  }

  const latest = trendRows.at(-1);
  const previous = trendRows.at(-2);
  elements.latestValue.textContent = formatNumber(latest.value);
  elements.latestYear.textContent = `${latest.year} год`;

  if (previous && Number(previous.value) !== 0) {
    const delta = ((Number(latest.value) - Number(previous.value)) / Number(previous.value)) * 100;
    elements.yearChange.textContent = formatPercent(delta);
    elements.yearChangeCaption.textContent = `${previous.year} → ${latest.year}`;
  } else {
    elements.yearChange.textContent = "-";
    elements.yearChangeCaption.textContent = "Недостаточно данных";
  }

  const selectedRegion = elements.object.value;
  const rankIndex = regionRows.findIndex((row) => row.object_name === selectedRegion);
  elements.regionRank.textContent = rankIndex >= 0 ? `#${rankIndex + 1}` : "-";
  elements.regionRankCaption.textContent = rankIndex >= 0 ? `из ${regionRows.length} территорий, ${latestYear}` : "Территория вне списка";
}

async function loadFilterOptions() {
  const [indicators, objects, organizations, groups, ages, durations] = await Promise.all([
    query(`SELECT DISTINCT indicator_name AS value FROM abortions ORDER BY value`),
    query(`SELECT DISTINCT object_name AS value FROM abortions ORDER BY value`),
    query(`SELECT DISTINCT organization_type AS value FROM abortions ORDER BY value`),
    query(`SELECT DISTINCT "group" AS value FROM abortions ORDER BY value`),
    query(`SELECT DISTINCT age AS value FROM abortions ORDER BY value`),
    query(`SELECT DISTINCT pregnancy_duration AS value FROM abortions ORDER BY value`)
  ]);

  state.defaults.indicator = fillSelect(elements.indicator, indicators.map((row) => row.value), "Всего абортов");
  state.defaults.object = fillSelect(elements.object, objects.map((row) => row.value), "Российская Федерация");
  state.defaults.organization = fillSelect(elements.organization, organizations.map((row) => row.value), "Всего");
  state.defaults.group = fillSelect(elements.group, groups.map((row) => row.value), "Всего");
  state.defaults.age = fillSelect(elements.age, ages.map((row) => row.value), "Всего");
  state.defaults.duration = fillSelect(elements.duration, durations.map((row) => row.value), "Всего");
}

async function updateDashboard() {
  if (state.loading) return;
  state.loading = true;
  setStatus("loading", "Обновляю графики", "Пересчитываю выборку по текущим фильтрам.");

  try {
    const trendRows = await query(`
      SELECT
        CAST(year AS INTEGER) AS year,
        SUM(TRY_CAST(indicator_value AS DOUBLE)) AS value
      FROM abortions
      WHERE ${selectedFilters()}
      GROUP BY 1
      ORDER BY 1
    `);

    const latestYear = trendRows.length ? trendRows.at(-1).year : null;

    const regionRows = latestYear === null ? [] : await query(`
      SELECT
        object_name,
        SUM(TRY_CAST(indicator_value AS DOUBLE)) AS value
      FROM abortions
      WHERE indicator_name = ${literal(elements.indicator.value)}
        AND organization_type = ${literal(elements.organization.value)}
        AND "group" = ${literal(elements.group.value)}
        AND age = ${literal(elements.age.value)}
        AND pregnancy_duration = ${literal(elements.duration.value)}
        AND CAST(year AS INTEGER) = ${latestYear}
        ${elements.showServiceValues.checked ? "" : `AND TRY_CAST(indicator_value AS DOUBLE) <> ${SERVICE_VALUE}`}
      GROUP BY 1
      ORDER BY value DESC NULLS LAST, object_name
      LIMIT 15
    `);

    const allRankRows = latestYear === null ? [] : await query(`
      SELECT
        object_name,
        SUM(TRY_CAST(indicator_value AS DOUBLE)) AS value
      FROM abortions
      WHERE indicator_name = ${literal(elements.indicator.value)}
        AND organization_type = ${literal(elements.organization.value)}
        AND "group" = ${literal(elements.group.value)}
        AND age = ${literal(elements.age.value)}
        AND pregnancy_duration = ${literal(elements.duration.value)}
        AND CAST(year AS INTEGER) = ${latestYear}
        ${elements.showServiceValues.checked ? "" : `AND TRY_CAST(indicator_value AS DOUBLE) <> ${SERVICE_VALUE}`}
      GROUP BY 1
      ORDER BY value DESC NULLS LAST, object_name
    `);

    const ageRows = latestYear === null ? [] : await query(`
      SELECT
        age,
        SUM(TRY_CAST(indicator_value AS DOUBLE)) AS value
      FROM abortions
      WHERE ${selectedFilters({ skipAge: true })}
        AND CAST(year AS INTEGER) = ${latestYear}
        AND age <> 'Всего'
      GROUP BY 1
      HAVING SUM(TRY_CAST(indicator_value AS DOUBLE)) IS NOT NULL
      ORDER BY value DESC NULLS LAST, age
    `);

    const previewRows = await query(`
      SELECT
        CAST(year AS INTEGER) AS year,
        TRY_CAST(indicator_value AS DOUBLE) AS indicator_value,
        source,
        comment
      FROM abortions
      WHERE ${selectedFilters()}
      ORDER BY year DESC
      LIMIT 8
    `);

    updateKpis(trendRows, allRankRows, latestYear);
    renderTrend(trendRows);
    renderRegions(regionRows, latestYear ?? "-");
    renderAgeBreakdown(ageRows, latestYear ?? "-");
    renderPreview(previewRows);

    elements.trendCaption.textContent = `${elements.indicator.value} · ${elements.object.value}`;
    setStatus("ready", "Дашборд готов", "Фильтры и графики обновляются прямо в браузере.");
  } catch (error) {
    console.error(error);
    setStatus("error", "Ошибка построения", error.message || "Не удалось выполнить запрос.");
  } finally {
    state.loading = false;
  }
}

function attachEvents() {
  [
    elements.indicator,
    elements.object,
    elements.organization,
    elements.group,
    elements.age,
    elements.duration,
    elements.showServiceValues
  ].forEach((element) => element.addEventListener("change", updateDashboard));

  elements.resetFilters.addEventListener("click", () => {
    elements.indicator.value = state.defaults.indicator;
    elements.object.value = state.defaults.object;
    elements.organization.value = state.defaults.organization;
    elements.group.value = state.defaults.group;
    elements.age.value = state.defaults.age;
    elements.duration.value = state.defaults.duration;
    elements.showServiceValues.checked = false;
    updateDashboard();
  });
}

async function initDuckDB() {
  setStatus("loading", "Запускаю DuckDB-Wasm", "Подбираю совместимый WebAssembly-бандл.");
  const bundles = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(bundles);
  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" })
  );
  const worker = new Worker(workerUrl);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(workerUrl);
  return db;
}

async function init() {
  try {
    state.db = await initDuckDB();
    state.conn = await state.db.connect();

    setStatus("loading", "Читаю Parquet", "Загружаю компактный файл данных в память браузера.");
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`Файл данных не найден: ${response.status}`);
    const parquetBuffer = new Uint8Array(await response.arrayBuffer());
    await state.db.registerFileBuffer("abortions_long.parquet", parquetBuffer);

    await state.conn.query(`
      CREATE OR REPLACE VIEW abortions AS
      SELECT * FROM read_parquet('abortions_long.parquet')
    `);

    await loadFilterOptions();
    attachEvents();
    await updateDashboard();
  } catch (error) {
    console.error(error);
    setStatus("error", "Не удалось запустить дашборд", error.message || "Проверьте структуру проекта и GitHub Pages.");
  }
}

init();
