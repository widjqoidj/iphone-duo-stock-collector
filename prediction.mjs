import { STORES, VARIANTS } from "./config.mjs";
import { easternDay, shiftDay } from "./trend.mjs";
import { historicalRecords } from "./history.mjs";

const DAY_MS = 86400000;
const RECENT_DAYS = 28;
const MIN_COVERED_DAYS = 14;
const MIN_RESTOCK_DAYS = 5;
const MIN_EPISODES = 8;
const minuteClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function localMinute(at) {
  const [hour, minute] = minuteClock.format(at).split(":").map(Number);
  return hour * 60 + minute;
}

export function restockEpisodes(events) {
  // Colors returning together and rapid stock flaps are one store episode.
  const episodes = [];
  const latestByStore = new Map();
  for (const event of [...events].sort((a, b) => a.at - b.at)) {
    const latest = latestByStore.get(event.storeId);
    if (!latest || event.at - latest.at > 30 * 60_000) {
      const episode = { at: event.at, storeId: event.storeId };
      episodes.push(episode);
      latestByStore.set(event.storeId, episode);
    }
  }
  return episodes;
}

function quantile(sorted, fraction) {
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  return sorted[lower] + (sorted[Math.ceil(position)] - sorted[lower]) * (position - lower);
}

export function predictRestock(trend, history, now = Date.now()) {
  const today = easternDay(now);
  const cutoff = shiftDay(today, 1 - RECENT_DAYS);
  const events = (trend?.events ?? []).filter(
    (event) =>
      Number.isFinite(event.at) &&
      event.at <= now &&
      easternDay(event.at) >= cutoff &&
      STORES.some((store) => store.id === event.storeId) &&
      VARIANTS.some((variant) => variant.id === event.variantId),
  );
  const episodes = restockEpisodes(events);
  const dates = [...new Set(episodes.map((event) => easternDay(event.at)))].sort();
  const coveredDates = Object.entries(trend?.days ?? {})
    .filter(
      // 225 checks exceeds 75% of even a 25-hour DST day at five-minute intervals.
      ([date, day]) => date >= cutoff && date < today && day.completeChecks >= 225,
    )
    .map(([date]) => date);
  const coveredDays = coveredDates.length;
  const span = dates.length ? (Date.parse(dates.at(-1)) - Date.parse(dates[0])) / DAY_MS : 0;
  // Missing observation days cannot silently become long waits between restocks.
  const elapsedDays = dates.length ? (Date.parse(today) - Date.parse(dates[0])) / DAY_MS : 0;
  const coveredSpan =
    dates.length && coveredDates.filter((date) => date >= dates[0]).length === elapsedDays;
  let range = null;
  let status = "learning";
  if (
    coveredDays >= MIN_COVERED_DAYS &&
    dates.length >= MIN_RESTOCK_DAYS &&
    episodes.length >= MIN_EPISODES &&
    span >= 14 &&
    coveredSpan
  ) {
    const gaps = dates
      .slice(1)
      .map((date, index) => (Date.parse(date) - Date.parse(dates[index])) / DAY_MS);
    gaps.sort((a, b) => a - b);
    const start = shiftDay(dates.at(-1), Math.max(1, Math.floor(quantile(gaps, 0.25))));
    const end = shiftDay(dates.at(-1), Math.max(1, Math.ceil(quantile(gaps, 0.75))));
    status = end < today ? "overdue" : "estimate";
    if (status === "estimate") range = { start: start < today ? today : start, end };
  }

  // Broader historical reports suggest hours to watch, never a forecast date.
  const reports = historicalRecords(history, now).filter(
    (record) => record.kind === "restock" && easternDay(record.at) >= cutoff,
  );
  const clues = STORES.map((store) => {
    const matching = reports.filter((record) => record.storeId === store.id);
    const minutes = matching.map((record) => localMinute(record.at));
    return {
      storeId: store.id,
      reports: matching.length,
      days: new Set(matching.map((record) => easternDay(record.at))).size,
      startHour: minutes.length ? Math.floor(Math.min(...minutes) / 60) : null,
      endHour: minutes.length ? Math.min(24, Math.floor(Math.max(...minutes) / 60) + 1) : null,
    };
  });
  return {
    status,
    range,
    coveredDays,
    restockDays: dates.length,
    episodes: episodes.length,
    requirements: {
      coveredDays: MIN_COVERED_DAYS,
      restockDays: MIN_RESTOCK_DAYS,
      episodes: MIN_EPISODES,
    },
    clues,
  };
}
