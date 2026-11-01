import { STORES, VARIANTS, productUrl, watchKey } from "./config.mjs";
export function applyObservations(previous, observations, now) {
    const snapshot = { watches: { ...previous.watches }, checkedAt: now, lastError: null };
    const items = [], degraded = [], recovered = [];
    for (const store of STORES)
        for (const variant of VARIANTS) {
            const key = watchKey(store.id, variant.id), old = previous.watches[key];
            const result = observations.find(o => o.key === key) ?? { key, status: "unknown", quote: "No result", pickup: "", error: "Missing result." };
            const valid = result.status !== "unknown";
            const changed = valid && (!old || old.confirmed !== result.status || old.pickup !== result.pickup);
            const version = (old?.version ?? 0) + (changed ? 1 : 0);
            const failures = valid ? 0 : (old?.failures ?? 0) + 1;
            const incident = !valid && (old?.incident === true || failures >= 3);
            if (incident && !old?.incident)
                degraded.push(`${store.name} / ${variant.color}`);
            if (valid && old?.incident)
                recovered.push(`${store.name} / ${variant.color}`);
            snapshot.watches[key] = { ...result, pickup: valid ? result.pickup : old?.pickup ?? "", confirmed: valid ? result.status : old?.confirmed ?? "unknown", confirmedAt: valid ? now : old?.confirmedAt ?? null, attemptedAt: now, version, failures, incident };
            if (!valid)
                snapshot.lastError = result.error ?? "Some pickup results could not be verified.";
            if (valid && result.status === "available" && changed)
                items.push({ key, version, store: store.name, color: variant.color, pickup: result.pickup, url: productUrl(variant.slug), reason: old?.confirmed === "available" ? "Pickup date changed" : "Available for pickup" });
        }
    const alerts = [];
    if (items.length)
        alerts.push({ type: "stock", title: "iPhone Duo 512GB pickup update", body: items.map(i => `${i.store} · ${i.color}: ${i.reason}${i.pickup ? ` (${i.pickup})` : ""}`).join("\n"), url: items.length === 1 ? items[0].url : "/", items });
    if (degraded.length)
        alerts.push({ type: "health", title: "Duo Watch needs attention", body: `Three checks failed for: ${degraded.join(", ")}. Saved stock may be stale.`, url: "/", items: [] });
    if (recovered.length)
        alerts.push({ type: "health", title: "Duo Watch checks recovered", body: `Verified pickup checks resumed for: ${recovered.join(", ")}.`, url: "/", items: [] });
    return { snapshot, alerts };
}
export function currentAlert(alert, snapshot) {
    if (alert.type !== "stock")
        return alert;
    const items = alert.items.filter(i => snapshot.watches[i.key]?.confirmed === "available" && snapshot.watches[i.key]?.version === i.version);
    return items.length ? { ...alert, items, body: items.map(i => `${i.store} · ${i.color}: ${i.reason}${i.pickup ? ` (${i.pickup})` : ""}`).join("\n"), url: items.length === 1 ? items[0].url : "/" } : null;
}
