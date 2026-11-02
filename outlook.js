import { STORES, VARIANTS } from "./config.mjs";
import { historicalRecords } from "./history.mjs?v=6";
import { predictRestock } from "./prediction.mjs?v=6";

const element = (id) => document.getElementById(id);
const hourLabel = (hour) => `${hour % 12 || 12}${hour < 12 || hour === 24 ? "am" : "pm"}`;
const dateLabel = (date) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
const timestampLabel = (at) =>
  new Date(at).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export function renderOutlook(trend, history) {
  const prediction = predictRestock(trend, history);
  element("prediction-title").textContent = prediction.range
    ? prediction.range.start === prediction.range.end
      ? dateLabel(prediction.range.start)
      : `${dateLabel(prediction.range.start)}–${dateLabel(prediction.range.end)}`
    : prediction.status === "overdue"
      ? "Previous pattern has passed"
      : "Learning the restock pattern";
  element("prediction-detail").textContent = prediction.range
    ? "Experimental next-restock range at any of your three stores. Based on the middle half of gaps between days with observed restocks; this is not a probability or a guarantee."
    : prediction.status === "overdue"
      ? "No new restock arrived within the historical range. The date estimate is withheld until fresh observations establish a pattern."
      : "There is not enough verified unlocked history to estimate a next-restock date. Historical reports below offer times to watch.";
  element("prediction-progress").textContent =
    `${prediction.coveredDays}/${prediction.requirements.coveredDays} well-covered days · ${prediction.restockDays}/${prediction.requirements.restockDays} restock days · ${prediction.episodes}/${prediction.requirements.episodes} separate store episodes. At least two weeks of restock history are required.`;
  const clues = element("prediction-clues");
  clues.replaceChildren();
  for (const clue of prediction.clues) {
    const row = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = STORES.find((store) => store.id === clue.storeId).name;
    const hours = document.createElement("span");
    hours.textContent = clue.reports
      ? `${hourLabel(clue.startHour)}–${hourLabel(clue.endHour)} ET`
      : "No reported hours";
    const sample = document.createElement("small");
    sample.textContent = `${clue.reports} reports · ${clue.days} day${clue.days === 1 ? "" : "s"}`;
    row.append(name, hours, sample);
    clues.append(row);
  }

  const records = historicalRecords(history).sort((a, b) => b.at - a.at);
  element("external-summary").textContent = history
    ? `${records.filter((record) => record.kind === "restock").length} restock reports and ${records.filter((record) => record.kind === "last-seen").length} last-in-stock sightings. Reviewed ${timestampLabel(history.reviewedAt)} ET. Partial archive; unlocked option not specified.`
    : "No external history has been imported.";
  const list = element("external-records");
  list.replaceChildren();
  for (const record of records) {
    const row = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = `${STORES.find((store) => store.id === record.storeId).name} · ${VARIANTS.find((variant) => variant.id === record.variantId).color}`;
    const detail = document.createElement("span");
    detail.textContent = `${timestampLabel(record.at)} ET · ${record.kind === "restock" ? "Reported restock" : "Last in stock; not a restock event"}`;
    const link = document.createElement("a");
    link.textContent = record.sourceName;
    link.href = record.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    row.append(title, detail, link);
    list.append(row);
  }
}
