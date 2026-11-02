import { describeHealth, displayStatus } from "./health.mjs?v=3";

const stores = [
  { id: "R096", name: "Shadyside", address: "5436 Walnut Street", slug: "shadyside" },
  { id: "R413", name: "Ross Park", address: "1000 Ross Park Mall Drive", slug: "rosspark" },
  {
    id: "R147",
    name: "South Hills Village",
    address: "301 South Hills Village",
    slug: "southhillsvillage",
  },
];
const variants = [
  { id: "MK1G4LL/A", color: "Star White", slug: "star-white", shade: "#e9e7e1" },
  { id: "MK1H4LL/A", color: "Night Sky", slug: "night-sky", shade: "#333c50" },
];

const DASHBOARD_REFRESH_MS = 60_000;
const element = (id) => document.getElementById(id);
let config;
let subscription;
let dashboardRefresh;
let cloudPushConfigured = false;
let lastDashboardData;

function escapeHtml(value) {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value ?? "").replace(/[&<>"']/g, (character) => entities[character]);
}

function formatTime(timestamp) {
  if (!timestamp) return "Not checked yet";
  return (
    new Date(timestamp).toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }) + " ET"
  );
}

function showMessage(text) {
  element("message").hidden = false;
  element("message").textContent = text;
}

function updateConnection(currentSubscription) {
  subscription = currentSubscription;
  element("connection").hidden = !subscription;
  element("connect").textContent = subscription
    ? "Notifications enabled on this device"
    : "Enable notifications";
  element("connect").hidden = !!subscription;
  element("device-status").textContent = subscription
    ? cloudPushConfigured
      ? "Device permission enabled · Cloud push configured"
      : "Device permission enabled · Finish cloud connection below"
    : "Enable alerts on this device.";
}

function renderVariant(store, variant, snapshot) {
  const watch = snapshot.watches[store.id + ":" + variant.id];
  const status = displayStatus(watch);
  const statusLabel =
    status === "available"
      ? "Available for pickup"
      : status === "unavailable"
        ? "Currently unavailable"
        : "Awaiting update";
  const lastConfirmed =
    watch && status === "unknown" && watch.confirmedAt
      ? `<small class="pickup-detail">Last confirmed ${escapeHtml(watch.confirmed)}: ${formatTime(watch.confirmedAt)}</small>`
      : "";
  const pickupDetail =
    status === "available" ? `<small class="pickup-detail">${escapeHtml(watch.quote)}</small>` : "";

  return `
    <div class="variant">
      <div class="variant-name">
        <span class="swatch" style="background:${variant.shade}"></span>${variant.color}
      </div>
      <div class="variant-result">
        <span class="availability ${status}"><span></span>${statusLabel}</span>
        <a href="https://www.apple.com/shop/buy-iphone/iphone-duo/7.6-inch-display-512gb-${variant.slug}-unlocked"
           target="_blank" rel="noreferrer" aria-label="Check ${variant.color} on Apple">›</a>
      </div>
      ${lastConfirmed}${pickupDetail}
    </div>`;
}

function renderStore(store, snapshot) {
  return `
    <article class="store-card">
      <div class="store-head">
        <div class="store-location" aria-hidden="true"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></svg></div>
        <div class="store-title"><h3>${store.name}</h3><p>${store.address}</p></div>
        <a class="store-link" href="https://www.apple.com/retail/${store.slug}/"
           target="_blank" rel="noreferrer" aria-label="Visit Apple ${store.name}">↗</a>
      </div>
      ${variants.map((variant) => renderVariant(store, variant, snapshot)).join("")}
    </article>`;
}

function renderStock(snapshot) {
  element("stores").innerHTML = stores.map((store) => renderStore(store, snapshot)).join("");
  const availableCount = stores.reduce(
    (count, store) =>
      count +
      variants.filter(
        (variant) => displayStatus(snapshot.watches[store.id + ":" + variant.id]) === "available",
      ).length,
    0,
  );
  const hasUnknownResults = stores.some((store) =>
    variants.some(
      (variant) => displayStatus(snapshot.watches[store.id + ":" + variant.id]) === "unknown",
    ),
  );
  element("stores").setAttribute("aria-busy", "false");
  element("summary").textContent = availableCount
    ? `${availableCount} pickup option${availableCount === 1 ? "" : "s"} found`
    : hasUnknownResults
      ? "Waiting for updated stock"
      : "No pickup availability right now";
  element("checked").textContent = formatTime(snapshot.checkedAt);
}

function renderHistory(history) {
  element("history").innerHTML = history
    .slice(0, 6)
    .map(
      (check) => `
        <div class="history-row">
          <span class="history-icon ${check.error ? "" : "ok"}">${check.error ? "!" : "✓"}</span>
          <div>
            <b>${check.error ? "Check needs attention" : "All three stores checked"}</b>
            <small>${check.trigger === "schedule" ? "Automatic check" : "Cloud check"} · ${check.verified} of 6 results verified</small>
          </div>
          <time>${formatTime(check.at)}</time>
        </div>`,
    )
    .join("");
}

function renderHealth(data) {
  const health = describeHealth(data);
  element("monitor-title").textContent = health.title;
  element("monitor-description").textContent = health.detail;
  element("monitor-dot").classList.toggle("amber", health.state !== "healthy");
  element("monitor-dot").classList.toggle(
    "error",
    ["source-error", "push-error"].includes(health.state),
  );
  element("monitor-checked").textContent = formatTime(data.snapshot.checkedAt);
  element("monitor-schedule").textContent = data.monitor?.lastScheduledAt
    ? formatTime(data.monitor.lastScheduledAt)
    : "No run recorded";
  element("monitor-push").textContent = data.lastPush?.configured
    ? data.lastPush.failed > 0
      ? "Delivery error"
      : "Configured"
    : "Not configured";
  element("source-error").textContent = data.snapshot.lastError ?? "";
  element("source-error").hidden = !data.snapshot.lastError;
  cloudPushConfigured = !!data.lastPush?.configured;
  updateConnection(subscription);
  element("push-status").textContent = cloudPushConfigured
    ? "Cloud push is configured. Device connection settings are only needed when adding or replacing a device."
    : "Complete the one-time GitHub secret connection to receive alerts.";
}

async function loadDashboard() {
  element("refresh").disabled = true;
  element("refresh").setAttribute("aria-busy", "true");
  if (lastDashboardData) {
    renderStock(lastDashboardData.snapshot);
    renderHealth(lastDashboardData);
  }
  try {
    const response = await fetch("./status.json?t=" + Date.now(), {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(
        "Cloud results could not load. Check your connection and tap Refresh results.",
      );
    }
    const data = await response.json();
    lastDashboardData = data;
    renderStock(data.snapshot);
    renderHistory(data.history);
    renderHealth(data);
    element("fetch-error").hidden = true;
  } catch (error) {
    element("fetch-error").hidden = false;
    element("fetch-error").textContent =
      error.name === "TimeoutError"
        ? "Loading took too long. Check your connection and tap Refresh results."
        : error.message;
    element("monitor-title").textContent = "Results could not load";
    element("monitor-description").textContent =
      "The app could not reach the published cloud results. This does not confirm an Apple stock change.";
    element("monitor-dot").classList.add("amber");
  } finally {
    element("refresh").disabled = false;
    element("refresh").setAttribute("aria-busy", "false");
  }
}

function refreshDashboard() {
  // Resume events and the one-minute timer may arrive together; share one request.
  if (!dashboardRefresh) {
    dashboardRefresh = loadDashboard().finally(() => {
      dashboardRefresh = null;
    });
  }
  return dashboardRefresh;
}

const registration =
  "serviceWorker" in navigator
    ? navigator.serviceWorker.register("./sw.js", { scope: "./" })
    : Promise.resolve(null);

async function initializeNotifications() {
  try {
    config = await (await fetch("./site-config.json")).json();
    element("repo-link").href = config.repoUrl;
    element("secret-link").href = config.repoUrl + "/settings/secrets/actions/new";
    element("test-link").href = config.repoUrl + "/actions/workflows/stock.yml";
    element("cloud-check-link").href = config.repoUrl + "/actions/workflows/stock.yml";
    const serviceWorker = await registration;
    if (serviceWorker) {
      updateConnection(await serviceWorker.pushManager.getSubscription());
    }
  } catch {
    showMessage("Notification setup could not load. Reload the page to try again.");
  }
}

function decodePublicKey(publicKey) {
  const padded =
    publicKey.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (publicKey.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function enableNotifications() {
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const isStandalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (isIos && !isStandalone) {
    showMessage("First add this site to your Home Screen, then open its icon.");
    return;
  }
  if (!("Notification" in window) || !("PushManager" in window)) {
    showMessage("Use the installed Home Screen app on iOS 16.4 or later.");
    return;
  }
  try {
    // iOS requires the permission request to start directly from this button tap.
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error("Allow notifications in your device’s Settings, then try again.");
    }
    const serviceWorker = await navigator.serviceWorker.ready;
    let currentSubscription = await serviceWorker.pushManager.getSubscription();
    if (!currentSubscription) {
      currentSubscription = await serviceWorker.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodePublicKey(config.publicKey),
      });
    }
    updateConnection(currentSubscription);
    showMessage(
      "Device permission is enabled. Copy the setup code below and save it as the PUSH_SUBSCRIPTIONS Actions secret.",
    );
  } catch (error) {
    showMessage(error.message);
  }
}

async function copySetupCode() {
  if (!subscription) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(subscription.toJSON()));
    showMessage(
      "Copied. In GitHub, set Name to PUSH_SUBSCRIPTIONS and paste the code into Secret. Save it, then run the workflow with send_test enabled.",
    );
  } catch {
    showMessage("Clipboard access failed. Try tapping Copy again.");
  }
}

async function disconnectNotifications() {
  if (subscription) await subscription.unsubscribe();
  updateConnection(null);
  showMessage(
    "This device has unsubscribed. Remove its PUSH_SUBSCRIPTIONS secret in GitHub if no longer needed.",
  );
}

element("refresh").onclick = refreshDashboard;
initializeNotifications();
element("connect").onclick = enableNotifications;
element("copy").onclick = copySetupCode;
element("disconnect").onclick = disconnectNotifications;
refreshDashboard();
setInterval(() => {
  if (!document.hidden) refreshDashboard();
}, DASHBOARD_REFRESH_MS);
// Home Screen apps can remain suspended for hours; reload results when reopened.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshDashboard();
});
window.addEventListener("pageshow", refreshDashboard);
window.addEventListener("online", refreshDashboard);
