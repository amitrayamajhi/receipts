/* Service worker: cache the app shell + vendored libs so it works offline
   after the first load. Data lives in IndexedDB, not here. */
const CACHE = "receipt-tracker-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/app.js",
  "./js/db.js",
  "./js/format.js",
  "./js/ocr.js",
  "./js/parser.js",
  "./js/rules.js",
  "./js/categorize.js",
  "./js/charts.js",
  "./js/exporter.js",
  "./js/screens/scan.js",
  "./js/screens/review.js",
  "./js/screens/log.js",
  "./js/screens/dashboard.js",
  "./js/screens/budgets.js",
  "./js/screens/settings.js",
  "./vendor/tesseract.min.js",
  "./vendor/worker.min.js",
  "./vendor/xlsx.full.min.js",
  "./vendor/tesseract-core-simd.wasm.js",
  "./vendor/tesseract-core.wasm.js",
  "./vendor/tesseract-core-simd-lstm.wasm.js",
  "./vendor/tesseract-core-lstm.wasm.js",
  "./vendor/tessdata/eng.traineddata.gz",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: "reload" }))).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  // Network-first: when the local server is reachable we always serve the
  // freshest files (so code updates show up immediately), and we refresh the
  // cache in the background. Only when offline do we fall back to the cache.
  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
  );
});
