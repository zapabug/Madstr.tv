// The service worker's source, put together at build time by the plugin in vite.config.ts (spec
// feat-pwa-zapstore §P1). `routeJs` is lib/swRoute.ts with its types stripped; `files` is the app shell of
// this build, under `base` ('/', or '/jukestr/' on pleb.world). The cache name carries the build's id, so a new deploy installs fresh files and the old cache
// is dropped once the new version takes over.

export function swSource(cacheName: string, files: readonly string[], routeJs: string, base = '/'): string {
  const page = JSON.stringify(`${base}index.html`);
  return `// Juke⚡tr service worker, generated at build time (see src/pwa/swSource.ts). Do not edit.
${routeJs}
const CACHE = ${JSON.stringify(cacheName)};
const FILES = ${JSON.stringify(files)};
const SHELL = new Set(FILES);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && (k.startsWith('jukestr-') || k.startsWith('madstr-'))).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const route = swRoute({ url: req.url, method: req.method, mode: req.mode }, self.location.origin, SHELL);
  if (route === 'navigate') {
    // Network first, so a new deploy shows at once; the kept page when offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((cache) => cache.put(${page}, copy)); }
          return res;
        })
        .catch(() => caches.match(${page}).then((hit) => hit || Response.error())),
    );
  } else if (route === 'shell') {
    event.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
  }
  // 'pass': not answered here; the browser goes to the network as if there were no service worker.
});
`;
}
