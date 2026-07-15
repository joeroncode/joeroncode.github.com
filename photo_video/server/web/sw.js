/* Minimal service worker: cache the app shell so Reel launches offline and
   qualifies as an installable PWA (required for the Play/TWA wrapper).
   API calls (/score, /pipeline, /samples, /download) always hit the network. */
const CACHE = "reel-shell-v1";
const SHELL = [
  "/",
  "/assets/styles.css",
  "/assets/app.js",
  "/assets/manifest.webmanifest",
  "/assets/icon-192.png",
  "/assets/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Never cache dynamic API responses.
  if (/^\/(score|render|pipeline|samples|download|health|jobs)/.test(url.pathname)) {
    return; // default network behaviour
  }
  // App shell: cache-first, fall back to network.
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request))
  );
});
