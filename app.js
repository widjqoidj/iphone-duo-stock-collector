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

const STALE_AFTER_MS = 15 * 60_000;
const DASHBOARD_REFRESH_MS = 60_000;
const element = (id) => document.getElementById(id);
let config;
let subscription;

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
    ? "Device enabled — finish GitHub connection"
    : "Enable notifications";
}

function displayStatus(watch) {
  const stale =
    !watch || watch.status === "unknown" || Date.now() - (watch.confirmedAt ?? 0) > STALE_AFTER_MS;
  return stale ? "unknown" : watch.confirmed;
}

function renderVariant(store, variant, snapshot) {
  const watch = snapshot.watches[store.id + ":" + variant.id];
  const status = displayStatus(watch);
  const statusLabel =
    status === "available"
      ? "Available for pickup"
      : status === "unavailable"
        ? "Currently unavailable"
        : "Needs a fresh check";
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

function renderStore(store, index, snapshot) {
  return `
    <article class="store-card">
      <div class="store-head">
        <div class="store-number">0${index + 1}</div>
        <div class="store-title"><h3>${store.name}</h3><p>${store.address}</p></div>
        <a class="store-link" href="https://www.apple.com/retail/${store.slug}/"
           target="_blank" rel="noreferrer" aria-label="Visit Apple ${store.name}">↗</a>
      </div>
      ${variants.map((variant) => renderVariant(store, variant, snapshot)).join("")}
    </article>`;
}

function renderStock(snapshot) {
  element("stores").innerHTML = stores
    .map((store, index) => renderStore(store, index, snapshot))
    .join("");
  const availableCount = stores.reduce(
    (count, store) =>
      count +
      variants.filter(
        (variant) => displayStatus(snapshot.watches[store.id + ":" + variant.id]) === "available",
      ).length,
    0,
  );
  element("summary").textContent = availableCount
    ? `${availableCount} pickup option${availableCount === 1 ? "" : "s"} found`
    : snapshot.lastError
      ? "Stock checks need attention"
      : "No pickup availability yet";
  element("checked").textContent = formatTime(snapshot.checkedAt);
  element("source-error").textContent = snapshot.lastError ?? "";

  const fresh = Date.now() - (snapshot.checkedAt ?? 0) < STALE_AFTER_MS;
  element("monitor-title").textContent =
    fresh && !snapshot.lastError ? "Cloud checker connected" : "Cloud checker needs attention";
  element("monitor-dot").classList.toggle("amber", !fresh || !!snapshot.lastError);
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
            <small>GitHub Actions · ${check.verified} of 6 results verified</small>
          </div>
          <time>${formatTime(check.at)}</time>
        </div>`,
    )
    .join("");
}

async function refreshDashboard() {
  try {
    const response = await fetch("./status.json?t=" + Date.now(), { cache: "no-store" });
    if (!response.ok) {
      throw new Error(
        "Cloud results are not published yet. Try again after the first workflow completes.",
      );
    }
    const data = await response.json();
    renderStock(data.snapshot);
    renderHistory(data.history);
    element("push-status").textContent = data.lastPush?.configured
      ? `Cloud push configured. Last run: ${data.lastPush.accepted} accepted, ${data.lastPush.failed} failed.`
      : "Finish the one-time GitHub secret connection to receive alerts.";
  } catch (error) {
    showMessage(error.message);
  }
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
await initializeNotifications();
element("connect").onclick = enableNotifications;
element("copy").onclick = copySetupCode;
element("disconnect").onclick = disconnectNotifications;
refreshDashboard();
setInterval(refreshDashboard, DASHBOARD_REFRESH_MS);
