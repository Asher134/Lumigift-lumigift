self.addEventListener("push", (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || "",
    icon: "/icon-192x192.png",
    badge: "/badge-72x72.png",
    tag: data.tag || "notification",
    requireInteraction: data.requireInteraction || false,
  };

  event.waitUntil(self.registration.showNotification(data.title || "Lumigift", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const url = event.notification.tag === "gift-claimed" ? "/gifts" : "/dashboard";
      for (let i = 0; i < windows.length; i++) {
        const w = windows[i];
        if (w.url === url && "focus" in w) {
          return w.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
