self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("push", (event) => {
  let notification = {
    title: "Duo Watch",
    body: "Your tracker has an update.",
    url: self.registration.scope,
  };
  try {
    notification = { ...notification, ...event.data.json() };
  } catch {
    // Use the default notification when the payload is missing or invalid.
  }
  event.waitUntil(
    self.registration.showNotification(notification.title, {
      body: notification.body,
      tag: notification.tag,
      icon: new URL("icon-192.png", self.registration.scope).href,
      data: { url: notification.url },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let target = self.registration.scope;
  try {
    const url = new URL(event.notification.data?.url ?? target, target);
    if (
      url.protocol === "https:" &&
      (url.origin === self.location.origin || url.hostname === "www.apple.com")
    )
      target = url.href;
  } catch {
    // Invalid links fall back to the installed dashboard.
  }
  event.waitUntil(self.clients.openWindow(target));
});
