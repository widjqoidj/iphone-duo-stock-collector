// Only explicit timer requests count toward automatic-check health.
export function describeTrigger(eventName = "local", timerSource = "manual") {
  if (eventName === "schedule") {
    return { type: "schedule", automatic: true, source: "GitHub" };
  }
  if (eventName === "workflow_dispatch" && timerSource === "cron-job.org") {
    return { type: "external-schedule", automatic: true, source: "cron-job.org" };
  }
  return { type: eventName, automatic: false, source: null };
}
