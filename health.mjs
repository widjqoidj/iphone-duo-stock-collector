export const STALE_AFTER_MS = 15 * 60_000;

export function displayStatus(watch, now = Date.now()) {
  if (!watch || watch.status === "unknown" || now - (watch.confirmedAt ?? 0) > STALE_AFTER_MS) {
    return "unknown";
  }
  return watch.confirmed;
}

export function describeHealth(data, now = Date.now()) {
  const { snapshot, lastPush, monitor } = data;
  const checkedAt = snapshot.checkedAt;
  const stale = !checkedAt || now - checkedAt > STALE_AFTER_MS;
  const lastScheduledAt = monitor?.lastScheduledAt;
  const timerOverdue = lastScheduledAt && now - lastScheduledAt > STALE_AFTER_MS;

  if (!checkedAt) {
    return {
      state: "starting",
      title: "Waiting for the first check",
      detail:
        "The cloud checker has not published a stock result yet. Open Run stock check to start one.",
    };
  }
  if (stale) {
    return {
      state: "overdue",
      title: "Cloud check overdue",
      detail:
        "The saved stock is over 15 minutes old. Refreshing this page cannot start an Apple check. Open Run stock check, then choose Run workflow in GitHub.",
    };
  }
  if (snapshot.lastError) {
    return {
      state: "source-error",
      title: "Stock check needs attention",
      detail:
        "The latest Apple check could not verify every result. Last confirmed stock is shown separately below.",
    };
  }
  if (!lastScheduledAt || timerOverdue) {
    return {
      state: "schedule-pending",
      title: lastScheduledAt ? "Automatic checks delayed" : "Automatic checks not confirmed",
      detail: lastScheduledAt
        ? "Stock data is current, but the last timer-triggered check is over 15 minutes old. Check the timer service if updates stop."
        : "Stock data is current. No timer-triggered check has been recorded yet; use Run stock check if updates stop.",
    };
  }
  if (lastPush?.failed > 0) {
    return {
      state: "push-error",
      title: "Notification delivery needs attention",
      detail:
        "Stock checks are current, but the push service rejected a notification. Review device connection settings and try a test.",
    };
  }
  return {
    state: "healthy",
    title: "Cloud checks are up to date",
    detail:
      "The latest stock check and automatic timer request are current. Checks target every five minutes; GitHub can delay job execution.",
  };
}
