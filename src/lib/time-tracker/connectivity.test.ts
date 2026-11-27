// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  backoffDelayMs,
  getClockOffsetMs,
  getConnectivity,
  isEffectivelyOnline,
  probeConnectivity,
  resetConnectivityForTests,
} from './connectivity'

/** offline-mode REQ-4: check C9 (probe truth and backoff). */

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => value,
  })
}

beforeEach(() => {
  localStorage.clear()
  setNavigatorOnline(true)
  resetConnectivityForTests()
})

describe('backoff', () => {
  it('steps 5 s, 30 s, 2 min, 10 min and stays there, within ±20%', () => {
    const mid = () => 0.5
    expect([1, 2, 3, 4, 5, 9].map((n) => backoffDelayMs(n, mid))).toEqual([
      5_000, 30_000, 120_000, 600_000, 600_000, 600_000,
    ])
    expect(backoffDelayMs(1, () => 0)).toBe(4_000)
    expect(backoffDelayMs(1, () => 1)).toBe(6_000)
  })
})

describe('probe', () => {
  it('treats a server that does not answer as offline even when the browser is online', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })

    expect(await probeConnectivity(fetchImpl as never)).toBe(false)
    const first = getConnectivity()
    expect(first.browserOnline).toBe(true)
    expect(isEffectivelyOnline(first)).toBe(false)
    expect(first.failures).toBe(1)
    const firstDelay = Date.parse(first.nextRetryAt!) - Date.now()
    expect(firstDelay).toBeGreaterThan(3_500)
    expect(firstDelay).toBeLessThanOrEqual(6_000)

    await probeConnectivity(fetchImpl as never)
    const secondDelay = Date.parse(getConnectivity().nextRetryAt!) - Date.now()
    expect(secondDelay).toBeGreaterThan(23_000)
    expect(secondDelay).toBeLessThanOrEqual(36_000)
  })

  it('does not call the network while the browser is offline', async () => {
    setNavigatorOnline(false)
    const fetchImpl = vi.fn()

    expect(await probeConnectivity(fetchImpl as never)).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('recovers and records the server clock offset', async () => {
    const serverNow = new Date(Date.now() + 90 * 60 * 1000).toISOString()
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: 'ok', checkedAt: serverNow }), {
          status: 200,
        }),
    )

    expect(await probeConnectivity(fetchImpl as never)).toBe(true)
    expect(getConnectivity()).toMatchObject({ reachable: true, failures: 0 })
    expect(Math.abs(getClockOffsetMs()! - 90 * 60 * 1000)).toBeLessThan(2_000)
  })

  it('treats a failing health check (5xx) as unreachable', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 503 }))
    expect(await probeConnectivity(fetchImpl as never)).toBe(false)
  })
})
