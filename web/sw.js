const CACHE_NAME = 'daily-karte-shell-20261113-2';
const SHELL_FILES = [
  './', './index.html', './app.js', './model.js', './icons.js', './account.js',
  './schema.js', './cloud.js', './sync-state.js', './site-config.js', './pwa.js',
  './activity-icons.js', './account-core.js', './firebase-session.js',
  './styles.css', './manifest.webmanifest', './favicon.svg', './favicon.ico',
  './apple-touch-icon.png', './icon-192.png', './icon-512.png',
];
const root = new URL('./', self.location.href);
const shellURLs = new Set(SHELL_FILES.map(file => new URL(file, root).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(
    SHELL_FILES.map(file => new Request(new URL(file, root), { cache: 'reload' })),
  )));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('daily-karte-shell-') && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== root.origin) return;
  url.search = '';
  url.hash = '';
  // Only public app files enter this cache. Account and Firebase requests bypass it.
  if (!shellURLs.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(url.href) ?? fetch(request);
  })());
});
