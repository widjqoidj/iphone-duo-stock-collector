import { STORES, VARIANTS } from "./config.mjs";
import { dailySeries, easternDay } from "./trend.mjs";

// Imports remain reports from their source. They never update stock or send alerts.
export function historicalRecords(history, now = Date.now()) {
  const records = new Map();
  for (const record of history?.records ?? []) {
    const source = history.sources?.[record.sourceId];
    const at = Date.parse(record.at);
    const reviewedAt = Date.parse(history.reviewedAt);
    let url;
    let sourceUrl;
    try {
      url = new URL(record.url);
      sourceUrl = new URL(source?.url);
    } catch {
      continue;
    }
    if (
      !source ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.hostname !== sourceUrl.hostname ||
      !STORES.some((store) => store.id === record.storeId) ||
      !VARIANTS.some((variant) => variant.id === record.variantId) ||
      record.model !== "iPhone Duo" ||
      record.storageGB !== 512 ||
      !["unlocked", "unspecified"].includes(record.carrier) ||
      !["restock", "last-seen"].includes(record.kind) ||
      !/(Z|[+-]\d{2}:\d{2})$/.test(record.at) ||
      !Number.isFinite(at) ||
      !Number.isFinite(reviewedAt) ||
      at > Math.min(now, reviewedAt)
    ) {
      continue;
    }
    const key = `${record.sourceId}:${record.kind}:${record.storeId}:${record.variantId}:${at}`;
    records.set(key, { ...record, at, sourceName: source.name });
  }
  return [...records.values()].sort((a, b) => a.at - b.at);
}

export function reportedSeries(history, now = Date.now()) {
  const records = historicalRecords(history, now).filter((record) => record.kind === "restock");
  return dailySeries(null, now).map((day) => {
    const reports = records.filter((record) => easternDay(record.at) === day.date);
    return {
      ...day,
      observed: reports.length > 0,
      restocks: reports.length || null,
      reports,
      byStore: Object.fromEntries(
        STORES.map((store) => [store.id, reports.filter((r) => r.storeId === store.id).length]),
      ),
    };
  });
}
