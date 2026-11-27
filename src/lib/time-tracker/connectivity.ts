/**
 * Connectivity truth for offline mode (offline-mode REQ-4).
 *
 * `navigator.onLine` is only a hint: captive portals, MDM proxies and a down
 * server all report "online". The unauthenticated `GET /api/health` probe
 * confirms the server is reachable before payroll-critical replay runs, and
 * its `checkedAt` gives the server/device clock offset recorded at capture.
 */

export type ConnectivityState = {
  /** The browser reports a network connection. */
  browserOnline: boolean
  /** The last probe reached the server (true until a probe says otherwise). */
  reachable: boolean
  /** Consecutive failed probes; drives the backoff. */
  failures: number
  lastProbeAt: string | null
  /** When the next automatic retry is due, while backing off. */
  nextRetryAt: string | null
}

const BACKOFF_MS = [5_000, 30_000, 120_000, 600_000]
const PROBE_TIMEOUT_MS = 5_000
const OFFSET_STORAGE_KEY = 'trackly-offline-clock-offset'

let state: ConnectivityState = {
  browserOnline: true,
  reachable: true,
  failures: 0,
  lastProbeAt: null,
  nextRetryAt: null,
}
const listeners = new Set<() => void>()
let clockOffsetMs: number | null = null

function setState(next: Partial<ConnectivityState>) {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

/** A fetch-level failure (no response), as opposed to a server rejection. */
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  if (err instanceof TypeError) return true
  const message = err instanceof Error ? err.message : ''
  return /failed to fetch|networkerror|network request failed|load failed|internet_disconnected/i.test(
    message,
  )
}

export function getConnectivity(): ConnectivityState {
  return state
}

/** Online for app purposes: the browser has a network and the server answered. */
export function isEffectivelyOnline(s: ConnectivityState = state): boolean {
  return s.browserOnline && s.reachable
}

export function subscribeConnectivity(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Delay before retry number `failures` (1-based), with ±20% jitter. */
export function backoffDelayMs(failures: number, random = Math.random): number {
  const base =
    BACKOFF_MS[Math.min(Math.max(failures, 1), BACKOFF_MS.length) - 1]
  return Math.round(base * (0.8 + random() * 0.4))
}

/** Server minus device clock, from the last successful probe. */
export function getClockOffsetMs(): number | null {
  if (clockOffsetMs !== null) return clockOffsetMs
  try {
    const stored = localStorage.getItem(OFFSET_STORAGE_KEY)
    if (stored !== null && Number.isFinite(Number(stored))) {
      clockOffsetMs = Number(stored)
    }
  } catch {
    // storage unavailable: offset stays unknown
  }
  return clockOffsetMs
}

function recordClockOffset(offset: number) {
  clockOffsetMs = offset
  try {
    localStorage.setItem(OFFSET_STORAGE_KEY, String(offset))
  } catch {
    // best effort
  }
}

export function syncBrowserOnline() {
  if (typeof navigator === 'undefined') return
  const browserOnline = navigator.onLine
  if (browserOnline === state.browserOnline) return
  // Coming back online clears a stale failed probe until the next one runs.
  setState(
    browserOnline
      ? { browserOnline, reachable: true, nextRetryAt: null }
      : { browserOnline },
  )
}

let inFlight: Promise<boolean> | null = null

/**
 * Checks that the server is reachable. Never loops: the caller (the sync
 * coordinator) schedules the next attempt from `nextRetryAt`.
 */
export function probeConnectivity(
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (inFlight) return inFlight
  syncBrowserOnline()
  if (!state.browserOnline) {
    setState({ reachable: false })
    return Promise.resolve(false)
  }
  inFlight = (async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
    const sentAt = Date.now()
    try {
      const response = await fetchImpl('/api/health', {
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`health ${response.status}`)
      const receivedAt = Date.now()
      try {
        const body = (await response.json()) as { checkedAt?: string }
        const serverTime = body.checkedAt ? Date.parse(body.checkedAt) : NaN
        if (Number.isFinite(serverTime)) {
          recordClockOffset(Math.round(serverTime - (sentAt + receivedAt) / 2))
        }
      } catch {
        // reachable even if the body is unexpected
      }
      setState({
        reachable: true,
        failures: 0,
        lastProbeAt: new Date().toISOString(),
        nextRetryAt: null,
      })
      return true
    } catch {
      const failures = state.failures + 1
      setState({
        reachable: false,
        failures,
        lastProbeAt: new Date().toISOString(),
        nextRetryAt: new Date(
          Date.now() + backoffDelayMs(failures),
        ).toISOString(),
      })
      return false
    } finally {
      clearTimeout(timer)
      inFlight = null
    }
  })()
  return inFlight
}

/** A replay request failed at the network level: back off like a probe. */
export function reportNetworkFailure() {
  const failures = state.failures + 1
  setState({
    reachable: false,
    failures,
    nextRetryAt: new Date(Date.now() + backoffDelayMs(failures)).toISOString(),
  })
}

let listening = false
/** Wires `online`/`offline` events once per page; callers sync the initial value. */
export function startConnectivityListeners() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('online', syncBrowserOnline)
  window.addEventListener('offline', syncBrowserOnline)
}

/** Test helper. */
export function resetConnectivityForTests(
  next: Partial<ConnectivityState> = {},
) {
  state = {
    browserOnline: true,
    reachable: true,
    failures: 0,
    lastProbeAt: null,
    nextRetryAt: null,
    ...next,
  }
  clockOffsetMs = null
  inFlight = null
  for (const listener of listeners) listener()
}
