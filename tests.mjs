import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePickup, fetchPickup } from "./apple.mjs";
import { applyObservations, currentAlert } from "./stock.mjs";
import { recordDailyTrend, dailySeries, easternDay } from "./trend.mjs";
import { trendFromSnapshots } from "./scripts/backfill-trend.mjs";
import { describeTrigger } from "./automation.mjs";
import { describeHealth, displayStatus, STALE_AFTER_MS } from "./health.mjs";
import { emptySnapshot, STORES, VARIANTS, watchKey } from "./config.mjs";
const fixture = () =>
  JSON.parse(readFileSync(new URL("./test-fixture.json", import.meta.url), "utf8"));
const unavailable = () => parsePickup(fixture());
const available = () =>
  unavailable().map((observation, index) =>
    index === 0
      ? { ...observation, status: "available", quote: "Available today", pickup: "today" }
      : observation,
  );
test("real captured response maps exactly six matching store/variant results", () => {
  const rows = unavailable();
  assert.equal(rows.length, 6);
  assert.ok(rows.every((result) => result.status === "unavailable"));
  assert.equal(rows[0].key, watchKey(STORES[0].id, VARIANTS[0].id));
});

test("first availability alerts once, including across serialized restart", () => {
  const first = applyObservations(emptySnapshot(), available(), 100);
  assert.equal(first.alerts.length, 1);
  const restart = JSON.parse(JSON.stringify(first.snapshot));
  assert.equal(applyObservations(restart, available(), 200).alerts.length, 0);
});

test("a real restock alerts again even with the same pickup wording", () => {
  let snapshot = applyObservations(emptySnapshot(), available(), 100).snapshot;
  snapshot = applyObservations(snapshot, unavailable(), 200).snapshot;
  assert.equal(applyObservations(snapshot, available(), 300).alerts.length, 1);
});

test("unknown preserves confirmed availability and does not cause a false restock", () => {
  let snapshot = applyObservations(emptySnapshot(), available(), 100).snapshot;
  snapshot = applyObservations(snapshot, [], 200).snapshot;
  assert.equal(Object.values(snapshot.watches)[0].confirmed, "available");
  assert.equal(Object.values(snapshot.watches)[0].confirmedAt, 100);
  assert.equal(applyObservations(snapshot, available(), 300).alerts.length, 0);
});

test("missing stores and wrong product titles remain unknown", () => {
  const responseData = fixture();
  responseData.body.stores = responseData.body.stores.filter(
    (store) => store.storeNumber !== STORES[1].id,
  );
  responseData.body.stores[0].partsAvailability[
    VARIANTS[0].id
  ].messageTypes.regular.storePickupProductTitle = "iPhone Duo 256GB Star White";
  const rows = parsePickup(responseData);
  assert.equal(rows.filter((result) => result.status === "unknown").length, 3);
});

test("pickup-date changes alert, cosmetic quote changes do not", () => {
  const snapshot = applyObservations(emptySnapshot(), available(), 100).snapshot;
  assert.equal(
    applyObservations(
      snapshot,
      available().map((observation) => ({ ...observation, quote: "Available Today" })),
      200,
    ).alerts.length,
    0,
  );
  assert.equal(
    applyObservations(
      snapshot,
      available().map((observation, index) =>
        index === 0 ? { ...observation, pickup: "tomorrow" } : observation,
      ),
      200,
    ).alerts.length,
    1,
  );
});

test("health incident is raised once after three errors and recovery once", () => {
  let snapshot = emptySnapshot();
  for (let index = 0; index < 3; index++) {
    const result = applyObservations(snapshot, [], index + 1);
    assert.equal(result.alerts.length, index === 2 ? 1 : 0);
    snapshot = result.snapshot;
  }
  const result = applyObservations(snapshot, [], 4);
  assert.equal(result.alerts.length, 0);
  const recovered = applyObservations(result.snapshot, unavailable(), 5);
  assert.equal(recovered.alerts.length, 1);
  assert.match(recovered.alerts[0].title, /recovered/);
});

test("superseded pending restock is not sent", () => {
  const first = applyObservations(emptySnapshot(), available(), 100);
  const gone = applyObservations(first.snapshot, unavailable(), 200);
  assert.equal(currentAlert(first.alerts[0], gone.snapshot), null);
});

test("malformed responses and HTML errors never become unavailable", async () => {
  assert.throws(() => parsePickup({ body: {} }));
  await assert.rejects(
    fetchPickup(
      async () => new Response("<html>error</html>", { headers: { "content-type": "text/html" } }),
    ),
    /not pickup JSON/,
  );
  await assert.rejects(
    fetchPickup(async () => new Response("", { status: 429, headers: { "retry-after": "120" } })),
    /retry-after=120/,
  );
});

function healthFixture(now) {
  return {
    snapshot: { checkedAt: now, lastError: null },
    lastPush: { configured: true, failed: 0 },
    monitor: { lastScheduledAt: now },
  };
}

test("old stock cannot appear current after reopening the app", () => {
  const now = 2_000_000;
  const watch = { status: "available", confirmed: "available", confirmedAt: now };
  assert.equal(displayStatus(watch, now), "available");
  assert.equal(displayStatus(watch, now + STALE_AFTER_MS), "available");
  assert.equal(displayStatus(watch, now + STALE_AFTER_MS + 1), "unknown");
  assert.equal(displayStatus({ ...watch, status: "unknown" }, now), "unknown");
});

test("manual stock success does not prove that automatic scheduling is healthy", () => {
  const now = 2_000_000;
  const data = healthFixture(now);
  data.monitor.lastScheduledAt = null;
  assert.equal(describeHealth(data, now).state, "schedule-pending");
  data.monitor.lastScheduledAt = now - STALE_AFTER_MS - 1;
  assert.equal(describeHealth(data, now).state, "schedule-pending");
  data.monitor.lastScheduledAt = now;
  assert.equal(describeHealth(data, now).state, "healthy");
});

test("overdue cloud checks explain that refreshing does not start an Apple request", () => {
  const now = 2_000_000;
  const data = healthFixture(now - STALE_AFTER_MS - 1);
  const health = describeHealth(data, now);
  assert.equal(health.state, "overdue");
  assert.match(health.detail, /cannot start an Apple check/);
  assert.match(health.detail, /Run workflow/);
});

test("health distinguishes first check, source errors, and push failures", () => {
  const now = 2_000_000;
  const data = healthFixture(now);
  data.snapshot.checkedAt = null;
  assert.equal(describeHealth(data, now).state, "starting");
  data.snapshot.checkedAt = now;
  data.snapshot.lastError = "Apple request failed";
  assert.equal(describeHealth(data, now).state, "source-error");
  data.snapshot.lastError = null;
  data.lastPush.failed = 1;
  assert.equal(describeHealth(data, now).state, "push-error");
});

test("external timer requests are identified without relabeling ordinary manual checks", () => {
  assert.deepEqual(describeTrigger("workflow_dispatch", "cron-job.org"), {
    type: "external-schedule",
    automatic: true,
    source: "cron-job.org",
  });
  assert.equal(describeTrigger("workflow_dispatch").automatic, false);
  assert.equal(describeTrigger("workflow_dispatch", "unknown").automatic, false);
  assert.equal(describeTrigger("push", "cron-job.org").automatic, false);
  assert.equal(describeTrigger().type, "local");
  assert.deepEqual(describeTrigger("schedule"), {
    type: "schedule",
    automatic: true,
    source: "GitHub",
  });
});

const trendStart = Date.parse("2026-11-01T20:00:00Z");

test("daily restocks exclude first-seen availability and pickup-date changes", () => {
  const initial = emptySnapshot();
  const firstTrend = recordDailyTrend(null, initial, available(), trendStart);
  assert.equal(firstTrend.days["2026-11-01"].restocks, 0);
  const soldOut = applyObservations(initial, unavailable(), trendStart).snapshot;
  let trend = recordDailyTrend(null, initial, unavailable(), trendStart);
  trend = recordDailyTrend(trend, soldOut, available(), trendStart + 300000);
  assert.equal(trend.days["2026-11-01"].restocks, 1);
  assert.equal(trend.days["2026-11-01"].byStore[STORES[0].id], 1);
  const stocked = applyObservations(soldOut, available(), trendStart + 300000).snapshot;
  trend = recordDailyTrend(
    trend,
    stocked,
    available().map((row) => ({ ...row, pickup: "tomorrow" })),
    trendStart + 600000,
  );
  assert.equal(trend.days["2026-11-01"].restocks, 1);
});

test("daily totals survive restarts and do not double-count saved or repeated checks", () => {
  const initial = applyObservations(emptySnapshot(), unavailable(), trendStart).snapshot;
  const allAvailable = unavailable().map((row) => ({ ...row, status: "available" }));
  const trend = recordDailyTrend(null, initial, allAvailable, trendStart + 300000);
  assert.equal(trend.days["2026-11-01"].restocks, 6);
  assert.deepEqual(Object.values(trend.days["2026-11-01"].byStore), [2, 2, 2]);
  const restarted = JSON.parse(JSON.stringify(trend));
  const stocked = applyObservations(initial, allAvailable, trendStart + 300000).snapshot;
  const duplicate = recordDailyTrend(restarted, stocked, allAvailable, trendStart + 300000);
  assert.deepEqual(duplicate, trend);
  const repeated = recordDailyTrend(duplicate, stocked, allAvailable, trendStart + 600000);
  assert.equal(repeated.days["2026-11-01"].restocks, 6);
  assert.equal(repeated.days["2026-11-01"].checks, 2);
  assert.equal(trend.days["2026-11-01"].checks, 1);
});

test("unknown recovery does not invent a restock from previously available stock", () => {
  let snapshot = applyObservations(emptySnapshot(), available(), trendStart).snapshot;
  snapshot = applyObservations(snapshot, [], trendStart + 300000).snapshot;
  const trend = recordDailyTrend(null, snapshot, available(), trendStart + 600000);
  assert.equal(trend.days["2026-11-01"].restocks, 0);
});

test("daily trend uses Eastern midnight and handles repeated daylight-saving hours", () => {
  assert.equal(easternDay(Date.parse("2026-11-01T05:30:00Z")), "2026-11-01");
  assert.equal(easternDay(Date.parse("2026-11-01T06:30:00Z")), "2026-11-01");
  const beforeMidnight = Date.parse("2026-11-02T04:59:59Z");
  const afterMidnight = Date.parse("2026-11-02T05:00:00Z");
  let trend = recordDailyTrend(null, emptySnapshot(), unavailable(), beforeMidnight);
  const soldOut = applyObservations(emptySnapshot(), unavailable(), beforeMidnight).snapshot;
  trend = recordDailyTrend(trend, soldOut, available(), afterMidnight);
  assert.equal(trend.days["2026-11-01"].restocks, 0);
  assert.equal(trend.days["2026-11-02"].restocks, 1);
  const series = dailySeries(trend, afterMidnight);
  assert.equal(new Set(series.map((day) => day.date)).size, 30);
  assert.equal(series.at(-1).date, "2026-11-02");
  assert.equal(series.at(-1).today, true);
});

test("histogram distinguishes missing and entirely failed days from verified zeroes", () => {
  let trend = recordDailyTrend(null, emptySnapshot(), [], trendStart);
  const nextDay = trendStart + 86400000;
  trend = recordDailyTrend(trend, emptySnapshot(), unavailable(), nextDay);
  const series = dailySeries(trend, nextDay);
  assert.equal(series.at(-3).restocks, null);
  assert.equal(series.at(-3).checks, 0);
  assert.equal(series.at(-2).restocks, null);
  assert.equal(series.at(-2).checks, 1);
  assert.equal(series.at(-1).restocks, 0);
  assert.equal(series.at(-1).completeChecks, 1);
});

test("partial checks retain coverage and count only configured store/color transitions", () => {
  const soldOut = applyObservations(emptySnapshot(), unavailable(), trendStart).snapshot;
  const rows = [available()[0], { key: "other:product", status: "available" }];
  const trend = recordDailyTrend(null, soldOut, rows, trendStart + 300000);
  const day = trend.days["2026-11-01"];
  assert.equal(day.restocks, 1);
  assert.equal(day.verifiedResults, 1);
  assert.equal(day.completeChecks, 0);
});

test("backfill sorts and deduplicates saved snapshots without treating initial stock as a restock", () => {
  const first = applyObservations(emptySnapshot(), available(), trendStart).snapshot;
  const soldOut = applyObservations(first, unavailable(), trendStart + 300000).snapshot;
  const restocked = applyObservations(soldOut, available(), trendStart + 600000).snapshot;
  const trend = trendFromSnapshots([
    restocked,
    first,
    soldOut,
    soldOut,
    restocked,
    emptySnapshot(),
  ]);
  assert.equal(trend.days["2026-11-01"].checks, 3);
  assert.equal(trend.days["2026-11-01"].restocks, 1);
});

test("daily totals retain a bounded 365-day history", () => {
  let trend;
  for (let day = 0; day < 400; day++) {
    trend = recordDailyTrend(trend, emptySnapshot(), unavailable(), trendStart + day * 86400000);
  }
  assert.equal(Object.keys(trend.days).length, 365);
  assert.equal(trend.days["2026-11-01"], undefined);
});
