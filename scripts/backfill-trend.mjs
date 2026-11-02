import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { emptySnapshot } from "../config.mjs";
import { recordDailyTrend } from "../trend.mjs";

export function trendFromSnapshots(snapshots) {
  const uniqueChecks = new Map();
  for (const snapshot of snapshots) {
    if (Number.isFinite(snapshot?.checkedAt) && snapshot.checkedAt > 0) {
      uniqueChecks.set(snapshot.checkedAt, snapshot);
    }
  }
  let trend = null;
  let previous = emptySnapshot();
  for (const snapshot of [...uniqueChecks.values()].sort((a, b) => a.checkedAt - b.checkedAt)) {
    trend = recordDailyTrend(trend, previous, Object.values(snapshot.watches), snapshot.checkedAt);
    previous = snapshot;
  }
  return trend;
}

export function readSavedSnapshots() {
  const commits = execFileSync("git", ["log", "--reverse", "--format=%H", "--", "state.json"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  if (!commits.length) return [];

  // Bound memory use while avoiding a separate Git process for every saved state.
  const snapshots = [];
  for (let start = 0; start < commits.length; start += 128) {
    const batch = commits.slice(start, start + 128);
    const blobs = execFileSync("git", ["cat-file", "--batch"], {
      input: batch.map((commit) => `${commit}:state.json\n`).join(""),
      maxBuffer: 64 * 1024 * 1024,
    });
    let offset = 0;
    for (const commit of batch) {
      const headerEnd = blobs.indexOf(10, offset);
      const header = blobs.subarray(offset, headerEnd).toString("utf8");
      const match = header.match(/^[a-f0-9]+ blob (\d+)$/);
      if (!match) throw new Error(`Cannot read saved state at ${commit}.`);
      const contentEnd = headerEnd + 1 + Number(match[1]);
      const state = JSON.parse(blobs.subarray(headerEnd + 1, contentEnd).toString("utf8"));
      snapshots.push(state.snapshot);
      offset = contentEnd + 1;
    }
  }
  return snapshots;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const state = JSON.parse(readFileSync("state.json", "utf8"));
  const snapshots = [...readSavedSnapshots(), state.snapshot];
  state.trend = trendFromSnapshots(snapshots);
  writeFileSync("state.json", JSON.stringify(state, null, 2) + "\n");
  console.log(JSON.stringify({ daysRecovered: Object.keys(state.trend?.days ?? {}).length }));
}
