/* Service worker: lets the quiz open instantly and work offline after the first visit.
 *  - the app shell and data files: network first, falling back to the cache
 *  - photos: cache first (they never change), keeping the most recent ones
 */
const VERSION = 'sarpa-v3';
const IMG_CACHE = VERSION + '-img';
const MAX_IMAGES = 700;

const SHELL = [
  './', 'index.html', 'manifest.webmanifest',
  'css/fonts.css', 'css/tokens.css', 'css/base.css', 'css/components.css', 'css/views.css', 'css/games.css',
  'assets/fonts/geist-latin-wght-normal.woff2', 'assets/fonts/geist-mono-latin-wght-normal.woff2', 'assets/fonts/doto-latin-full-normal.woff2',
  'data/species.js', 'data/photos.js',
  'js/config.js', 'js/util.js', 'js/store.js', 'js/data.js', 'js/explain.js', 'js/engine.js', 'js/herpdle-core.js', 'js/ui.js',
  'js/api.js', 'js/account.js', 'js/explainpanel.js', 'js/badges.js', 'js/quiz.js', 'js/views-main.js', 'js/results.js',
  'js/herpdle.js', 'js/ranks.js', 'js/guide.js', 'js/extras.js', 'js/pages.js', 'js/legal.js', 'js/app.js',
  'assets/icon.svg', 'assets/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length > MAX_IMAGES) await Promise.all(keys.slice(0, keys.length - MAX_IMAGES).map((k) => cache.delete(k)));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // leave third-party requests alone
  if (url.pathname.includes('/api/')) return;         // accounts and leaderboards: always live, never cached

  if (url.pathname.includes('/images/')) {
    event.respondWith(
      caches.open(IMG_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res && res.ok) { cache.put(req, res.clone()); trim(cache); }
        return res;
      })
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('index.html')))
  );
});
