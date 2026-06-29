// @vitest-environment jsdom

import { act } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { useNetworkStatus } from './useNetworkStatus'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => value,
  })
}

describe('useNetworkStatus', () => {
  let root: ReturnType<typeof createRoot> | null = null

  afterEach(() => {
    if (root) {
      act(() => root?.unmount())
      root = null
    }
    setNavigatorOnline(true)
  })

  it('uses an online initial snapshot for SSR and hydration', () => {
    setNavigatorOnline(false)
    let isOnline: boolean | null = null
    const container = document.createElement('div')
    root = createRoot(container)

    act(() => {
      flushSync(() => {
        root?.render(
          <NetworkStatusProbe onStatusChange={(value) => (isOnline = value)} />,
        )
      })
      expect(isOnline).toBe(true)
    })
  })

  it('syncs to navigator.onLine after mount', async () => {
    setNavigatorOnline(false)
    let isOnline: boolean | null = null
    const container = document.createElement('div')
    root = createRoot(container)

    await act(async () => {
      root?.render(
        <NetworkStatusProbe onStatusChange={(value) => (isOnline = value)} />,
      )
    })

    expect(isOnline).toBe(false)
  })

  it('updates when online and offline events fire', async () => {
    setNavigatorOnline(true)
    let isOnline: boolean | null = null
    const container = document.createElement('div')
    root = createRoot(container)

    await act(async () => {
      root?.render(
        <NetworkStatusProbe onStatusChange={(value) => (isOnline = value)} />,
      )
    })

    expect(isOnline).toBe(true)

    act(() => {
      setNavigatorOnline(false)
      window.dispatchEvent(new Event('offline'))
    })
    expect(isOnline).toBe(false)

    act(() => {
      setNavigatorOnline(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(isOnline).toBe(true)
  })
})

function NetworkStatusProbe({
  onStatusChange,
}: {
  onStatusChange: (isOnline: boolean) => void
}) {
  const { isOnline } = useNetworkStatus()
  onStatusChange(isOnline)
  return null
}
