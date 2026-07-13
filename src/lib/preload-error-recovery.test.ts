// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import {
  preloadErrorAsset,
  recoverFromPreloadError,
} from './preload-error-recovery'

describe('preload error recovery', () => {
  it('extracts the failed asset URL from a dynamic import error', () => {
    expect(
      preloadErrorAsset(
        new TypeError(
          'Failed to fetch dynamically imported module: https://example.com/assets/report-old.js',
        ),
      ),
    ).toBe('https://example.com/assets/report-old.js')
  })

  it("reloads once for a failed asset and cancels Vite's thrown error", () => {
    const storage = window.sessionStorage
    storage.clear()
    const reload = vi.fn()
    const first = new CustomEvent('vite:preloadError', {
      cancelable: true,
      detail: undefined,
    }) as CustomEvent & { payload?: unknown }
    first.payload = new TypeError(
      'Failed to fetch dynamically imported module: /assets/jspdf.plugin.autotable-old.js',
    )

    expect(recoverFromPreloadError(first, storage, reload)).toBe(true)
    expect(first.defaultPrevented).toBe(true)
    expect(reload).toHaveBeenCalledOnce()

    const second = new CustomEvent('vite:preloadError', {
      cancelable: true,
    }) as CustomEvent & { payload?: unknown }
    second.payload = first.payload

    expect(recoverFromPreloadError(second, storage, reload)).toBe(false)
    expect(second.defaultPrevented).toBe(false)
    expect(reload).toHaveBeenCalledOnce()
  })

  it('does not reload when storage cannot provide a loop guard', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('storage blocked')
      }),
      setItem: vi.fn(),
    }
    const event = new CustomEvent('vite:preloadError', {
      cancelable: true,
    })
    const reload = vi.fn()

    expect(recoverFromPreloadError(event, storage, reload)).toBe(false)
    expect(event.defaultPrevented).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})
