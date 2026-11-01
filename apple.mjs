import { STORES, VARIANTS, watchKey } from "./config.mjs";
const plain = (value) => typeof value === "string" ? value.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 400) : "";
export function parsePickup(data) {
    const body = data?.body;
    if (!body || !Array.isArray(body.stores))
        throw new Error("Apple returned an unexpected pickup response.");
    return STORES.flatMap(store => VARIANTS.map(variant => {
        const key = watchKey(store.id, variant.id);
        const found = body.stores.find(s => s.storeNumber === store.id);
        const part = found?.partsAvailability?.[variant.id];
        const regular = part?.messageTypes?.regular;
        if (!found || found.storeName !== store.name || !part || part.partNumber !== variant.id || plain(regular?.storePickupProductTitle) !== `iPhone Duo 512GB ${variant.color}`) {
            return { key, status: "unknown", quote: "No verified result", pickup: "", error: "Missing or mismatched product/store in Apple response." };
        }
        if (!["available", "unavailable"].includes(part.pickupDisplay ?? "") || (part.pickupDisplay === "available" && part.storePickEligible !== true)) {
            return { key, status: "unknown", quote: plain(part.pickupSearchQuote) || "Availability unknown", pickup: "", error: "Apple did not confirm pickup eligibility." };
        }
        const quote = plain(part.pickupSearchQuote) || plain(regular?.storePickupQuote);
        return { key, status: part.pickupDisplay, quote, pickup: part.pickupDisplay === "available" ? plain(regular?.pickupDate) || quote.toLowerCase().replace(/\s+/g, " ") : "" };
    }));
}
export function pickupUrl() {
    const url = new URL("https://www.apple.com/shop/retail/pickup-message");
    url.searchParams.set("pl", "true");
    url.searchParams.set("mts.0", "regular");
    url.searchParams.set("location", "15232");
    VARIANTS.forEach((v, i) => url.searchParams.set(`parts.${i}`, v.id));
    return url.toString();
}
export async function fetchPickup(fetcher = fetch) {
    const response = await fetcher(pickupUrl(), { headers: { Accept: "application/json", "User-Agent": "DuoWatch/1.0 (personal pickup availability monitor)" }, signal: AbortSignal.timeout(20_000), redirect: "manual", cache: "no-store" });
    if (!response.ok) {
        const retry = response.headers.get("Retry-After");
        throw new Error(`Apple pickup request failed (HTTP ${response.status})${retry && /^\d{1,6}$/.test(retry) ? `; retry-after=${retry}` : ""}.`);
    }
    if (!response.headers.get("content-type")?.includes("application/json"))
        throw new Error("Apple returned HTML or an unsupported response, not pickup JSON.");
    return parsePickup(await response.json());
}
