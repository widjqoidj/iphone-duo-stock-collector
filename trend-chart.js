import { STORES } from "./config.mjs";
import { dailySeries, easternDay } from "./trend.mjs?v=6";
import { reportedSeries } from "./history.mjs?v=6";

const element = (id) => document.getElementById(id);
const dateLabel = (date, options = { month: "short", day: "numeric" }) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
const checkTime = (timestamp) =>
  new Date(timestamp).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
let currentTrend;
let currentHistory;
let series = [];
const externalMode = () => element("trend-source").value === "external";

function countLabel(day) {
  if (!day.observed)
    return externalMode() ? "No imported records" : day.checks ? "No verified data" : "Not tracked";
  return `${day.restocks} ${externalMode() ? "reported" : "observed"} restock${day.restocks === 1 ? "" : "s"}`;
}

function drawHistogram(selectedDate) {
  const width = Math.max(280, element("trend-chart").clientWidth);
  const height = 204;
  const left = 28;
  const top = 12;
  const bottom = 170;
  const plotWidth = width - left - 8;
  const columnWidth = plotWidth / series.length;
  const highest = Math.max(1, ...series.map((day) => day.restocks ?? 0));
  const tickStep = Math.max(1, Math.ceil(highest / 4));
  const axisMax = Math.ceil(highest / tickStep) * tickStep;
  const y = (count) => bottom - (count / axisMax) * (bottom - top);
  const ticks = Array.from({ length: axisMax / tickStep + 1 }, (_, index) => index * tickStep);
  const total = series.reduce((sum, day) => sum + (day.restocks ?? 0), 0);

  element("trend-chart").innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="trend-chart-title trend-chart-description">
      <title id="trend-chart-title">${externalMode() ? "Reported" : "Observed"} restocks per day over the last 30 days</title>
      <desc id="trend-chart-description">${total} ${externalMode() ? "reported" : "observed"} restocks. Gray dashes mean missing data. Use Day details to read counts for each date. Today is in progress.</desc>
      ${ticks.map((tick) => `<line x1="${left}" y1="${y(tick)}" x2="${width - 8}" y2="${y(tick)}" class="trend-gridline"/><text x="${left - 8}" y="${y(tick) + 4}" text-anchor="end" class="trend-axis-label">${tick}</text>`).join("")}
      ${series
        .map((day, index) => {
          const x = left + index * columnWidth;
          const barWidth = Math.max(2, columnWidth * 0.6);
          const center = x + columnWidth / 2;
          const mark = !day.observed
            ? `<line x1="${center - 2}" y1="${bottom}" x2="${center + 2}" y2="${bottom}" class="trend-missing"/>`
            : day.restocks === 0
              ? `<circle cx="${center}" cy="${bottom}" r="2" class="trend-zero"/>`
              : `<rect x="${center - barWidth / 2}" y="${y(day.restocks)}" width="${barWidth}" height="${bottom - y(day.restocks)}" rx="2" class="trend-bar"/>`;
          return `<g data-trend-date="${day.date}"><title>${dateLabel(day.date)}: ${countLabel(day)}${day.today ? ", in progress" : ""}</title><rect x="${x}" y="${top}" width="${columnWidth}" height="${bottom - top + 5}" class="trend-hit-area${day.date === selectedDate ? " selected" : ""}"/>${mark}</g>`;
        })
        .join("")}
      ${[0, 7, 14, 21, 29].map((index) => `<text x="${left + (index + 0.5) * columnWidth}" y="${height - 9}" text-anchor="${index === 0 ? "start" : index === 29 ? "end" : "middle"}" class="trend-axis-label">${dateLabel(series[index].date)}</text>`).join("")}
    </svg>`;
}

function renderSelectedDay() {
  const day = series.find((entry) => entry.date === element("trend-day").value);
  if (!day) return;
  const coverage = externalMode()
    ? "Partial external archive. No imported records does not mean zero restocks. Unlocked option not specified. See Sources and records for timestamps and attribution."
    : day.observed
      ? `${day.completeChecks} fully verified checks · ${day.verifiedResults} of ${day.checks * 6} results verified. Observed ${checkTime(day.firstCheckAt)}–${checkTime(day.lastCheckAt)} ET.`
      : day.checks
        ? `${day.checks} checks were attempted, but no stock results were verified.`
        : "No stock checks were recorded for this day.";
  element("trend-day-detail").innerHTML = `
    <div class="trend-day-heading"><b>${countLabel(day)}</b>${day.today ? '<span class="trend-today">In progress</span>' : ""}</div>
    <div class="trend-store-totals">${STORES.map((store) => `<div><span>${store.name}</span><b>${day.observed ? (day.byStore[store.id] ?? 0) : "—"}</b></div>`).join("")}</div>
    <p>${coverage}</p>`;
  drawHistogram(day.date);
}

export function renderTrend(trend, history) {
  currentTrend = trend;
  currentHistory = history;
  series = externalMode() ? reportedSeries(history) : dailySeries(trend);
  const selectedDate = element("trend-day").value;
  const total = series.reduce((sum, day) => sum + (day.restocks ?? 0), 0);
  const observedDays = series.filter((day) => day.observed).length;
  element("trend-total").textContent = total;
  element("trend-period").textContent =
    `${dateLabel(series[0].date)} – ${dateLabel(series.at(-1).date)}`;
  element("trend-count-label").textContent =
    `${externalMode() ? "reported" : "observed"} restocks · 30 days`;
  element("trend-legend-observed").textContent = externalMode() ? "Reported" : "Observed";
  element("trend-legend-missing").textContent = externalMode()
    ? "No imported records"
    : "No verified data";
  element("trend-note").textContent = externalMode()
    ? `${total} reported store/color restocks across ${observedDays} days. Partial public history for 512GB; carrier option unspecified. These records do not change live stock or send alerts.`
    : trend
      ? `${total === 0 ? "No restocks observed yet. " : ""}${observedDays} of 30 days have verified data. Tracking began ${dateLabel(easternDay(trend.startedAt))}.`
      : "Daily history will appear after the next cloud check.";
  element("trend-day").innerHTML = series
    .map(
      (day) =>
        `<option value="${day.date}">${dateLabel(day.date, { month: "short", day: "numeric", year: "numeric" })}${day.today ? " · Today" : ""} — ${countLabel(day)}</option>`,
    )
    .join("");
  element("trend-day").value = series.some((day) => day.date === selectedDate)
    ? selectedDate
    : series.at(-1).date;
  renderSelectedDay();
}

element("trend-day").onchange = renderSelectedDay;
element("trend-source").onchange = () => renderTrend(currentTrend, currentHistory);
element("trend-chart").onclick = (event) => {
  const date = event.target.closest("[data-trend-date]")?.dataset.trendDate;
  if (date) {
    element("trend-day").value = date;
    renderSelectedDay();
  }
};
window.addEventListener("resize", () => renderTrend(currentTrend, currentHistory));
