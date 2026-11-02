import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePickup, fetchPickup } from "./apple.mjs";
import { applyObservations, currentAlert } from "./stock.mjs";
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
