import { STORES, VARIANTS, watchKey } from "./config.mjs";

export const TREND_DAYS = 30;
const RETENTION_DAYS = 365;
const DAY_MS = 24 * 60 * 60_000;
const easternDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function easternDay(timestamp) {
  const parts = Object.fromEntries(
    easternDate.formatToParts(timestamp).map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function shiftDay(day, offset) {
  // Shift calendar dates in UTC so a daylight-saving transition cannot skip a bin.
  return new Date(Date.parse(`${day}T12:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10);
}

export function recordDailyTrend(previous, previousSnapshot, observations, now) {
  // Pending alerts and delivery results may save the same stock check twice.
  if (previous && now <= previous.lastCheckAt) return previous;

  const date = easternDay(now);
  const existing = previous?.days[date];
  const day = {
    restocks: existing?.restocks ?? 0,
    checks: (existing?.checks ?? 0) + 1,
    verifiedResults: existing?.verifiedResults ?? 0,
    completeChecks: existing?.completeChecks ?? 0,
    firstCheckAt: existing?.firstCheckAt ?? now,
    lastCheckAt: now,
    byStore: { ...Object.fromEntries(STORES.map((store) => [store.id, 0])), ...existing?.byStore },
  };
  let verifiedThisCheck = 0;
  const events = [...(previous?.events ?? [])];
  for (const store of STORES) {
    for (const variant of VARIANTS) {
      const key = watchKey(store.id, variant.id);
      const observation = observations.find((result) => result.key === key);
      if (!["available", "unavailable"].includes(observation?.status)) continue;
      verifiedThisCheck++;
      // First-seen availability and pickup-date changes are not confirmed restocks.
      if (
        previousSnapshot.watches[key]?.confirmed === "unavailable" &&
        observation.status === "available"
      ) {
        day.restocks++;
        day.byStore[store.id]++;
        events.push({ at: now, storeId: store.id, variantId: variant.id });
      }
    }
  }
  day.verifiedResults += verifiedThisCheck;
  if (verifiedThisCheck === STORES.length * VARIANTS.length) day.completeChecks++;

  const cutoff = shiftDay(date, 1 - RETENTION_DAYS);
  const days = Object.fromEntries(
    Object.entries({ ...previous?.days, [date]: day }).filter(([key]) => key >= cutoff),
  );
  return {
    startedAt: previous?.startedAt ?? now,
    lastCheckAt: now,
    days,
    events: events.filter((event) => easternDay(event.at) >= cutoff),
  };
}

export function dailySeries(trend, now = Date.now(), count = TREND_DAYS) {
  const today = easternDay(now);
  return Array.from({ length: count }, (_, index) => {
    const date = shiftDay(today, index + 1 - count);
    const day = trend?.days[date];
    const observed = (day?.verifiedResults ?? 0) > 0;
    return {
      date,
      today: date === today,
      observed,
      restocks: observed ? day.restocks : null,
      checks: day?.checks ?? 0,
      verifiedResults: day?.verifiedResults ?? 0,
      completeChecks: day?.completeChecks ?? 0,
      firstCheckAt: day?.firstCheckAt ?? null,
      lastCheckAt: day?.lastCheckAt ?? null,
      byStore: day?.byStore ?? {},
    };
  });
}
