/**
 * Trackly service worker (offline-mode REQ-6).
 *
 * - `/app/*` navigations are network-first. Offline, they get the neutral
 *   shell: `/app/time-tracker?offline-shell=1`, rendered by the server without
 *   loaders, so it holds no user data (decision Q2). The app then opens from
 *   the member's encrypted IndexedDB snapshot, or shows the sign-in gate.
 * - Content-hashed `/assets/*` are cache-first.
 * - API and server-function traffic (`/api/*`, `/_serverFn/*`) and every
 *   non-GET request always go to the network and are never cached.
 * - A new version waits until the page accepts the update prompt
 *   (`SKIP_WAITING`), so it never reloads in the middle of an offline sync.
 *
 * Bump CACHE_VERSION to roll out changes to every installed client.
 */
const CACHE_VERSION = 'trackly-v2'
const STATIC_CACHE = `${CACHE_VERSION}-static`
const ASSET_CACHE = `${CACHE_VERSION}-assets`
const SHELL_CACHE = `${CACHE_VERSION}-shell`
const OFFLINE_URL = '/offline.html'
const SHELL_URL = '/app/time-tracker?offline-shell=1'
const SHELL_REFRESH_MS = 60 * 60 * 1000

function isNetworkOnly(url) {
  return (
    url.pathname.startsWith('/api/') || url.pathname.startsWith('/_serverFn/')
  )
}

/** Fetches the shell anonymously and caches it with the assets it loads. */
async function refreshShell() {
  const response = await fetch(SHELL_URL, {
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'follow',
  })
  // The tracker route canonicalizes its search (adds `focusTimer`); accept
  // that redirect, but never cache anything that lost the shell flag (such as
  // a redirect to sign-in), since only the shell is free of user data.
  const finalUrl = new URL(response.url)
  if (!response.ok || !finalUrl.searchParams.has('offline-shell')) return
  const html = await response.clone().text()
  const assets = [
    ...new Set(
      [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]),
    ),
  ]
  const assetCache = await caches.open(ASSET_CACHE)
  await Promise.all(
    assets.map(async (asset) => {
      if (await assetCache.match(asset)) return
      const assetResponse = await fetch(asset, { credentials: 'omit' })
      if (assetResponse.ok) await assetCache.put(asset, assetResponse)
    }),
  )
  // Store a fresh, non-redirected copy: browsers refuse to answer a
  // navigation with a response that followed a redirect.
  const shellCache = await caches.open(SHELL_CACHE)
  await shellCache.put(
    SHELL_URL,
    new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  )
  lastShellRefresh = Date.now()
}

let lastShellRefresh = 0

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then((cache) => cache.add(OFFLINE_URL)),
      // Offline boot is best effort at install; it retries on later visits.
      refreshShell().catch(() => undefined),
    ]),
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

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type
  if (type === 'SKIP_WAITING') {
    void self.skipWaiting()
  } else if (type === 'CLEAR_OFFLINE_SHELL') {
    // Logout wipe (REQ-8): drop the cached shell; assets hold no user data.
    event.waitUntil(
      caches.delete(SHELL_CACHE).then(() => {
        lastShellRefresh = 0
        if (event.ports[0]) event.ports[0].postMessage({ ok: true })
      }),
    )
  }
})

async function cacheFirstAsset(request) {
  const cache = await caches.open(ASSET_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}

async function navigate(event, url) {
  try {
    const response = await fetch(event.request)
    if (
      url.pathname.startsWith('/app') &&
      response.ok &&
      Date.now() - lastShellRefresh > SHELL_REFRESH_MS
    ) {
      event.waitUntil(refreshShell().catch(() => undefined))
    }
    return response
  } catch {
    if (url.pathname === '/app' || url.pathname.startsWith('/app/')) {
      const shell = await caches.match(SHELL_URL, { cacheName: SHELL_CACHE })
      if (shell) return shell
    }
    const offline = await caches.match(OFFLINE_URL, { cacheName: STATIC_CACHE })
    return offline ?? Response.error()
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (isNetworkOnly(url)) return

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirstAsset(request))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(navigate(event, url))
  }
})
