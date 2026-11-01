import { STORES, VARIANTS, productUrl, watchKey } from "./config.mjs";

export function applyObservations(previous, observations, now) {
  const snapshot = { watches: { ...previous.watches }, checkedAt: now, lastError: null };
  const items = [];
  const degradedWatches = [];
  const recoveredWatches = [];
  for (const store of STORES) {
    for (const variant of VARIANTS) {
      const key = watchKey(store.id, variant.id);
      const previousWatch = previous.watches[key];
      const observation = observations.find((observation) => observation.key === key) ?? {
        key,
        status: "unknown",
        quote: "No result",
        pickup: "",
        error: "Missing result.",
      };
      const isVerified = observation.status !== "unknown";
      const changed =
        isVerified &&
        (!previousWatch ||
          previousWatch.confirmed !== observation.status ||
          previousWatch.pickup !== observation.pickup);
      const version = (previousWatch?.version ?? 0) + (changed ? 1 : 0);
      const failures = isVerified ? 0 : (previousWatch?.failures ?? 0) + 1;
      const incident = !isVerified && (previousWatch?.incident === true || failures >= 3);
      if (incident && !previousWatch?.incident)
        degradedWatches.push(`${store.name} / ${variant.color}`);
      if (isVerified && previousWatch?.incident)
        recoveredWatches.push(`${store.name} / ${variant.color}`);
      // Keep the last confirmed stock when this check cannot verify a result.
      snapshot.watches[key] = {
        ...observation,
        pickup: isVerified ? observation.pickup : (previousWatch?.pickup ?? ""),
        confirmed: isVerified ? observation.status : (previousWatch?.confirmed ?? "unknown"),
        confirmedAt: isVerified ? now : (previousWatch?.confirmedAt ?? null),
        attemptedAt: now,
        version,
        failures,
        incident,
      };
      if (!isVerified)
        snapshot.lastError = observation.error ?? "Some pickup results could not be verified.";
      if (isVerified && observation.status === "available" && changed)
        items.push({
          key,
          version,
          store: store.name,
          color: variant.color,
          pickup: observation.pickup,
          url: productUrl(variant.slug),
          reason:
            previousWatch?.confirmed === "available"
              ? "Pickup date changed"
              : "Available for pickup",
        });
    }
  }
  const alerts = [];
  if (items.length)
    alerts.push({
      type: "stock",
      title: "iPhone Duo 512GB pickup update",
      body: items
        .map(
          (item) =>
            `${item.store} · ${item.color}: ${item.reason}${item.pickup ? ` (${item.pickup})` : ""}`,
        )
        .join("\n"),
      url: items.length === 1 ? items[0].url : "/",
      items,
    });
  if (degradedWatches.length)
    alerts.push({
      type: "health",
      title: "Duo Watch needs attention",
      body: `Three checks failed for: ${degradedWatches.join(", ")}. Saved stock may be stale.`,
      url: "/",
      items: [],
    });
  if (recoveredWatches.length)
    alerts.push({
      type: "health",
      title: "Duo Watch checks recovered",
      body: `Verified pickup checks resumed for: ${recoveredWatches.join(", ")}.`,
      url: "/",
      items: [],
    });
  return { snapshot, alerts };
}

export function currentAlert(alert, snapshot) {
  if (alert.type !== "stock") return alert;
  const items = alert.items.filter(
    (item) =>
      snapshot.watches[item.key]?.confirmed === "available" &&
      snapshot.watches[item.key]?.version === item.version,
  );
  return items.length
    ? {
        ...alert,
        items,
        body: items
          .map(
            (item) =>
              `${item.store} · ${item.color}: ${item.reason}${item.pickup ? ` (${item.pickup})` : ""}`,
          )
          .join("\n"),
        url: items.length === 1 ? items[0].url : "/",
      }
    : null;
}
