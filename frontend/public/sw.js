// Voyager PDF page cache — cache-first strategy for rendered page images.
// Cached pages survive tab close and page reload → textbook feels instant on revisit.

const CACHE = "voyager-pages-v1";

// Cache rendered page images aggressively (they never change for a given document+page+dpi)
const isPageImage = (url) =>
  url.includes("/api/documents/") && url.includes("/pages/") && !url.includes("/text");

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (!isPageImage(event.request.url)) return; // let non-page requests pass through normally

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) cache.put(event.request, response.clone());
      return response;
    })
  );
});

// Message handler: allow the app to prefetch pages into cache
self.addEventListener("message", (event) => {
  if (event.data?.type !== "PREFETCH") return;
  const { urls } = event.data;
  caches.open(CACHE).then(async (cache) => {
    for (const url of urls) {
      const cached = await cache.match(url);
      if (!cached) {
        try {
          const res = await fetch(url);
          if (res.ok) cache.put(url, res);
        } catch {}
      }
    }
  });
});
