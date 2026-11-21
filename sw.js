// peaktoswell – the service worker. It keeps on the device:
//   - the app itself (its page, style, script, font and pictures), and
//   - every data file the app has shown, each with the time it was saved.
// With a connection the data always comes from the network. Without one the saved copy
// is answered instead, marked so that the app can say "Offline · showing data saved …".

const VERSION = '5'; // the same number as ?v= in index.html: raise both together
const SHELL = `shell-${VERSION}`;
const DATA = 'data-1';
const SHELL_FILES = [
  './',
  `app/app.css?v=${VERSION}`,
  `app/app.js?v=${VERSION}`,
  'app/icon.svg',
  'app/icons/icon-192.png',
  'app/img/peak.jpg',
  'app/img/slope.jpg',
  'app/fonts/manrope-latin-wght-normal.woff2',
  'app/fonts/manrope-latin-ext-wght-normal.woff2',
  'manifest.webmanifest',
];
const DATA_PATH = new URL('data/', self.registration.scope).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith('shell-') && name !== SHELL).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

/** A copy of a data answer that remembers when it was saved. */
async function stamped(response) {
  const headers = new Headers(response.headers);
  headers.set('x-saved-at', new Date().toISOString());
  return new Response(await response.blob(), { status: 200, statusText: 'OK', headers });
}

/** The saved copy of a data file, marked as such; undefined when there is none. */
async function savedCopy(cache, key) {
  const saved = await cache.match(key);
  if (!saved) return undefined;
  const headers = new Headers(saved.headers);
  headers.set('x-from-cache', '1');
  return new Response(await saved.blob(), { status: 200, statusText: 'OK', headers });
}

/** Data: the network first; the saved copy only when the network cannot be reached. */
async function data(request) {
  const cache = await caches.open(DATA);
  const key = new URL(request.url).pathname;
  let response;
  try {
    response = await fetch(request);
  } catch (error) {
    const saved = await savedCopy(cache, key);
    if (saved) return saved;
    throw error;
  }
  if (response.ok) {
    await cache.put(key, await stamped(response.clone()));
  } else if (response.status === 404) {
    await cache.delete(key); // the backend no longer publishes this file
  } else if (response.status >= 500) {
    return (await savedCopy(cache, key)) || response;
  }
  return response;
}

/** The app's own files: the page from the network when it can be reached, the rest from the device. */
async function shell(request) {
  const cache = await caches.open(SHELL);
  if (request.mode === 'navigate') {
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put('./', response.clone());
      return response;
    } catch (error) {
      const saved = await cache.match('./');
      if (saved) return saved;
      throw error;
    }
  }
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(url.pathname.startsWith(DATA_PATH) ? data(request) : shell(request));
});
