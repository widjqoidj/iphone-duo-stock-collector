import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import webpush from "web-push";
import { describeTrigger } from "./automation.mjs";
import { fetchPickup } from "./apple.mjs";
import { applyObservations, currentAlert } from "./stock.mjs";
import { STORES, VARIANTS, watchKey, emptySnapshot, POLL_MS } from "./config.mjs";

const HISTORY_LIMIT = 20;
const PENDING_LIMIT = 24;
const HEALTH_ALERT_TTL_MS = 60 * 60_000;
const MAX_PUSH_ATTEMPTS = 3;
const PERMANENT_PUSH_ERRORS = new Set([400, 401, 403, 404, 410]);
const PUBLIC_ASSETS = [
  "index.html",
  "app.js",
  "health.mjs",
  "styles.css",
  "sw.js",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "site-config.json",
];

function readState() {
  return existsSync("state.json")
    ? JSON.parse(readFileSync("state.json", "utf8"))
    : { snapshot: emptySnapshot(), history: [], pending: [], lastPush: null };
}

async function collectObservations() {
  try {
    return await fetchPickup();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Source request failed";
    // A failed request is unknown; it must never look like confirmed sold-out stock.
    return STORES.flatMap((store) =>
      VARIANTS.map((variant) => ({
        key: watchKey(store.id, variant.id),
        status: "unknown",
        quote: "Check failed",
        pickup: "",
        error: message,
      })),
    );
  }
}

function createPendingAlert(alert, now) {
  return {
    id: randomUUID(),
    alert,
    at: now,
    expiresAt: now + (alert.type === "health" ? HEALTH_ALERT_TTL_MS : POLL_MS),
    accepted: [],
  };
}

function recordCheck(state, observations, now, siteUrl) {
  const { snapshot, alerts } = applyObservations(state.snapshot, observations, now);
  const trigger = describeTrigger(process.env.GITHUB_EVENT_NAME, process.env.TIMER_SOURCE);
  state.snapshot = snapshot;
  state.history = [
    {
      at: now,
      verified: observations.filter((observation) => observation.status !== "unknown").length,
      error: snapshot.lastError,
      trigger: trigger.type,
    },
    ...state.history,
  ].slice(0, HISTORY_LIMIT);

  if (trigger.automatic) {
    state.lastScheduledAt = now;
    state.lastTimerSource = trigger.source;
  }

  for (const alert of alerts) {
    state.pending.push(createPendingAlert(alert, now));
  }
  if (process.env.SEND_TEST === "true") {
    state.pending.push(
      createPendingAlert(
        {
          type: "test",
          title: "Duo Watch is connected",
          body: "Test notification only. Your iPhone can receive pickup alerts from the free cloud tracker.",
          url: siteUrl,
          items: [],
        },
        now,
      ),
    );
  }
}

function persistState(state, message) {
  writeFileSync("state.json", JSON.stringify(state, null, 2) + "\n");
  if (process.env.GITHUB_ACTIONS !== "true") return;

  execFileSync("git", ["config", "user.name", "github-actions[bot]"]);
  execFileSync("git", [
    "config",
    "user.email",
    "41898282+github-actions[bot]@users.noreply.github.com",
  ]);
  execFileSync("git", ["add", "state.json"]);
  try {
    execFileSync("git", ["diff", "--cached", "--quiet"]);
  } catch {
    execFileSync("git", ["commit", "-m", message], { stdio: "ignore" });
    execFileSync("git", ["push", "origin", "HEAD:main"], { stdio: "ignore" });
  }
}

function parseSecret(name, fallback) {
  try {
    return JSON.parse(process.env[name] || fallback);
  } catch {
    throw new Error(`${name} is not valid JSON.`);
  }
}

function validateSubscriptions(subscriptions) {
  for (const subscription of subscriptions) {
    const endpoint = new URL(subscription.endpoint);
    const supportedHost =
      endpoint.hostname.endsWith(".push.apple.com") ||
      endpoint.hostname === "fcm.googleapis.com" ||
      endpoint.hostname === "updates.push.services.mozilla.com";
    if (
      endpoint.protocol !== "https:" ||
      endpoint.port ||
      endpoint.username ||
      endpoint.password ||
      !supportedHost
    ) {
      throw new Error("Unsupported push endpoint.");
    }
    if (!subscription.keys?.p256dh || !subscription.keys?.auth) {
      throw new Error("Incomplete push subscription.");
    }
  }
}

function queueInitialAvailability(state, observations, now) {
  const baseline = applyObservations(emptySnapshot(), observations, now).alerts.find(
    (alert) => alert.type === "stock",
  );
  if (!baseline) return;

  // A newly connected phone should hear about stock already available at setup time.
  const alert = {
    ...baseline,
    items: baseline.items.map((item) => ({
      ...item,
      version: state.snapshot.watches[item.key].version,
    })),
  };
  state.pending = state.pending.filter((pending) => pending.alert.type !== "stock");
  state.pending.push(createPendingAlert(alert, now));
  persistState(state, "Queue current availability for newly connected iPhone");
}

async function deliverNotification(subscription, pending, alert, config, keys) {
  for (let attempt = 0; attempt < MAX_PUSH_ATTEMPTS; attempt++) {
    const ttl = Math.floor((pending.expiresAt - Date.now()) / 1000);
    if (ttl <= 0) return "expired";
    try {
      await webpush.sendNotification(
        subscription,
        JSON.stringify({
          title: alert.title,
          body: alert.body,
          url: alert.type === "stock" ? alert.url : config.siteUrl,
          tag: pending.id,
        }),
        {
          TTL: ttl,
          urgency: alert.type === "stock" ? "high" : "normal",
          timeout: 5000,
          vapidDetails: {
            subject: config.siteUrl,
            publicKey: keys.publicKey,
            privateKey: keys.privateKey,
          },
        },
      );
      return "accepted";
    } catch (error) {
      const status = Number(error.statusCode ?? 0);
      if (attempt === MAX_PUSH_ATTEMPTS - 1 || PERMANENT_PUSH_ERRORS.has(status)) {
        return "failed";
      }
      await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1000));
    }
  }
}

async function sendPendingAlerts(state, subscriptions, config, keys) {
  let accepted = 0;
  let failed = 0;
  for (const pending of state.pending) {
    const alert = currentAlert(pending.alert, state.snapshot);
    if (!alert || pending.expiresAt <= Date.now()) continue;
    if (!keys || !subscriptions.length) continue;

    for (const subscription of subscriptions) {
      const subscriptionId = createHash("sha256")
        .update(subscription.endpoint)
        .digest("hex")
        .slice(0, 24);
      if (pending.accepted.includes(subscriptionId)) continue;

      const result = await deliverNotification(subscription, pending, alert, config, keys);
      if (result === "accepted") {
        pending.accepted.push(subscriptionId);
        accepted++;
      } else if (result === "failed") {
        failed++;
      }
    }
  }

  state.pending = state.pending
    .filter(
      (pending) =>
        pending.expiresAt > Date.now() &&
        (!subscriptions.length || pending.accepted.length < subscriptions.length),
    )
    .slice(-PENDING_LIMIT);
  state.lastPush = {
    at: Date.now(),
    accepted,
    failed,
    configured: !!keys && subscriptions.length > 0,
  };
}

function publishDashboard(state) {
  mkdirSync("public", { recursive: true });
  for (const file of PUBLIC_ASSETS) {
    copyFileSync(file, `public/${file}`);
  }
  // Only public stock and delivery totals go into Pages; secrets stay in Actions.
  writeFileSync(
    "public/status.json",
    JSON.stringify(
      {
        snapshot: state.snapshot,
        history: state.history,
        lastPush: state.lastPush,
        generatedAt: Date.now(),
        monitor: {
          lastScheduledAt: state.lastScheduledAt ?? null,
          timerSource: state.lastTimerSource ?? null,
        },
      },
      null,
      2,
    ),
  );
}

async function main() {
  const config = JSON.parse(readFileSync("site-config.json", "utf8"));
  const state = readState();
  const now = Date.now();
  const observations = await collectObservations();
  recordCheck(state, observations, now, config.siteUrl);
  // Save pending events before sending so a restarted run can recover them.
  persistState(state, "Record pickup check and pending alerts");

  const subscriptionValue = parseSecret("PUSH_SUBSCRIPTIONS", "[]");
  const subscriptions = Array.isArray(subscriptionValue) ? subscriptionValue : [subscriptionValue];
  const keys = parseSecret("VAPID_KEYS", "null");
  if (keys && keys.publicKey !== config.publicKey) {
    throw new Error("VAPID public key differs from the installed app. Preserve the original keys.");
  }
  if (keys && subscriptions.length && !state.lastPush?.configured) {
    queueInitialAvailability(state, observations, now);
  }
  validateSubscriptions(subscriptions);
  await sendPendingAlerts(state, subscriptions, config, keys);
  persistState(state, "Record notification delivery results");
  publishDashboard(state);

  console.log(
    JSON.stringify({
      verifiedResults: observations.filter((observation) => observation.status !== "unknown")
        .length,
      sourceError: state.snapshot.lastError,
      pushAccepted: state.lastPush.accepted,
      pushFailed: state.lastPush.failed,
      pushConfigured: state.lastPush.configured,
    }),
  );
  if (state.snapshot.lastError) process.exitCode = 1;
}

await main();
