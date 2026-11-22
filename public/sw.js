const CACHE_NAME = "inout-qr-v3";
const STATIC_ASSET_EXTS = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot)$/i;

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('inout-qr-') && k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Only handle GET requests
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Leave cross-origin requests (OpenStreetMap tiles, place search) entirely to the browser.
  if (url.origin !== self.location.origin) return;

  // Only cache versioned production assets from this app, never dev modules or RPCs.
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/') && STATIC_ASSET_EXTS.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then(async (cached) => {
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, response.clone());
        }
        return response;
      })
    );
    return;
  }

  // Network-first for navigation and everything else
  event.respondWith(
    fetch(event.request).catch(() => {
      // For navigation requests, return offline fallback
      if (event.request.mode === "navigate") {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          return new Response(
            `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>InOut — Offline</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f3f4f6; color: #1f2937; }
    .card { background: white; border-radius: 0.75rem; padding: 2rem; text-align: center; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); max-width: 24rem; margin: 1rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #6b7280; margin-bottom: 1.5rem; }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">📡</div>
    <h1>You're offline</h1>
    <p>InOut needs a network connection to check in or out. Please reconnect and try again.</p>
  </div>
</body>
</html>`,
            { status: 503, headers: { "Content-Type": "text/html" } }
          );
        });
      }
      return new Response("Offline", { status: 503 });
    })
  );
});

// ─── Shift-end reminders (Web Push) ───────────────────────────────────────
// Payloads are `{ web_push?: 8030, notification: { title, body, tag, data: { url } } }`; the same
// object is a Declarative Web Push message on Safari 18.4+. Safari revokes permission when a
// push shows nothing, so a notification is always shown, with fallback text if needed.
const REMINDER_FALLBACK = {
  title: "Still at work?",
  body: "Open InOut to check out.",
  tag: "checkout-reminder",
  data: { url: "/" },
};

function sameOriginPath(raw) {
  try {
    const url = new URL(raw || "/", self.location.origin);
    return url.origin === self.location.origin ? url.pathname + url.search + url.hash : "/";
  } catch {
    return "/";
  }
}

self.addEventListener("push", (event) => {
  let n = REMINDER_FALLBACK;
  try {
    const payload = event.data ? event.data.json() : null;
    const candidate = payload && typeof payload === "object" ? payload.notification : null;
    if (candidate && typeof candidate.title === "string" && candidate.title) n = candidate;
  } catch {
    // Not JSON: keep the fallback.
  }
  const data = n.data && typeof n.data === "object" ? n.data : {};
  event.waitUntil(
    self.registration.showNotification(String(n.title).slice(0, 120), {
      body: typeof n.body === "string" ? n.body.slice(0, 240) : REMINDER_FALLBACK.body,
      tag: typeof n.tag === "string" ? n.tag : REMINDER_FALLBACK.tag,
      lang: "en-GB",
      icon: "/logo192.png",
      badge: "/logo192.png",
      data: { url: sameOriginPath(data.url || n.navigate) },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = sameOriginPath(event.notification.data && event.notification.data.url);
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        const focused = await open.focus();
        if (focused && new URL(focused.url).pathname !== new URL(target).pathname && "navigate" in focused) {
          await focused.navigate(target).catch(() => {});
        }
        return;
      }
      await self.clients.openWindow(target);
    })
  );
});
