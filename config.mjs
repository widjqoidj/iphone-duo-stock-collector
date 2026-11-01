export const POLL_MS = 5 * 60_000;
export const STORES = [
    { id: "R096", name: "Shadyside", address: "5436 Walnut Street", zip: "15232", slug: "shadyside" },
    { id: "R413", name: "Ross Park", address: "1000 Ross Park Mall Drive", zip: "15237", slug: "rosspark" },
    { id: "R147", name: "South Hills Village", address: "301 South Hills Village", zip: "15241", slug: "southhillsvillage" },
];
export const VARIANTS = [
    { id: "MK1G4LL/A", color: "Star White", slug: "star-white", shade: "#e9e7e1" },
    { id: "MK1H4LL/A", color: "Night Sky", slug: "night-sky", shade: "#333c50" },
];
export const productUrl = (slug) => `https://www.apple.com/shop/buy-iphone/iphone-duo/7.6-inch-display-512gb-${slug}-unlocked`;
export const watchKey = (store, part) => `${store}:${part}`;
export const emptySnapshot = () => ({ watches: {}, checkedAt: null, lastError: null });
