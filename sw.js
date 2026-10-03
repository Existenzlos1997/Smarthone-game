const CACHE_NAME = 'kaltmark-shell-v1';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './src/arenas.js',
  './src/battle.js',
  './src/cards.js',
  './src/huntGame.js',
  './src/liveBattle.js',
  './src/player.js',
  './assets/app-icon.svg',
  './assets/monsters/archer.svg',
  './assets/monsters/catapult.svg',
  './assets/monsters/dragon.svg',
  './assets/monsters/griffin.svg',
  './assets/monsters/knight.svg',
  './assets/monsters/mage.svg',
  './assets/monsters/shieldbearer.svg',
  './assets/monsters/swordsman.svg',
  './assets/spells/blitz.svg',
  './assets/spells/feuer.svg',
  './assets/spells/frost.svg',
  './assets/spells/heil.svg',
  './assets/spells/pfeil.svg',
  './assets/spells/wut.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    })),
  );
});
