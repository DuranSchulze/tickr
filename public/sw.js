/**
 * Trackly service worker.
 *
 * Purpose: satisfy install criteria and give installed users a branded
 * offline fallback instead of the browser's dinosaur error. Deliberately
 * minimal — no offline data layer, API traffic is never touched.
 *
 * Bump CACHE_VERSION to roll out changes to every installed client.
 */
const CACHE_VERSION = 'trackly-v1'
const OFFLINE_URL = '/offline.html'
const BUILD_CACHE = `${CACHE_VERSION}-build`

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(CACHE_VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Immutable, content-hashed Nitro client assets: cache-first is safe.
  if (url.pathname.startsWith('/_build/')) {
    event.respondWith(
      caches.open(BUILD_CACHE).then(async (cache) => {
        const cached = await cache.match(request)
        if (cached) return cached
        const response = await fetch(request)
        if (response.ok) cache.put(request, response.clone())
        return response
      }),
    )
    return
  }

  // Navigations: network-first so users always get fresh HTML; fall back to
  // the branded offline page only when the network is unreachable.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_VERSION)
        return (await cache.match(OFFLINE_URL)) ?? Response.error()
      }),
    )
  }
})
