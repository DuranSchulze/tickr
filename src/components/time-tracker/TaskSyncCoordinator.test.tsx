// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(() => Promise.resolve()),
  routerInvalidate: vi.fn(() => Promise.resolve()),
  captureException: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}))

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ invalidate: mocks.routerInvalidate }),
}))

vi.mock('@sentry/react', () => ({
  captureException: mocks.captureException,
}))

// Mocks must be registered before loading the component under test.
// eslint-disable-next-line import/first
import { TaskSyncCoordinator } from './TaskSyncCoordinator'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = []
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null

  constructor(public readonly name: string) {
    MockBroadcastChannel.instances.push(this)
  }

  postMessage() {}
  close() {}
}

function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value,
  })
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value,
  })
}

describe('TaskSyncCoordinator', () => {
  let root: ReturnType<typeof createRoot> | null = null

  beforeEach(() => {
    vi.useFakeTimers()
    mocks.invalidateQueries.mockReset().mockResolvedValue(undefined)
    mocks.routerInvalidate.mockReset().mockResolvedValue(undefined)
    mocks.captureException.mockReset()
    MockBroadcastChannel.instances = []
    Object.defineProperty(window, 'BroadcastChannel', {
      configurable: true,
      value: MockBroadcastChannel,
    })
    setVisibility('visible')
    setOnline(true)
  })

  afterEach(() => {
    act(() => root?.unmount())
    root = null
    vi.useRealTimers()
  })

  async function renderCoordinator(pathname = '/app/time-tracker') {
    const container = document.createElement('div')
    root = createRoot(container)
    await act(async () => {
      root?.render(
        <TaskSyncCoordinator workspaceId="workspace-1" pathname={pathname}>
          <div>child</div>
        </TaskSyncCoordinator>,
      )
    })
  }

  it('coalesces simultaneous activation events into one refresh', async () => {
    await renderCoordinator()

    act(() => {
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new PageTransitionEvent('pageshow'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await act(async () => vi.advanceTimersByTimeAsync(1_000))

    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(1)
    expect(mocks.routerInvalidate).toHaveBeenCalledTimes(1)
  })

  it('defers hidden remote changes until the tab becomes visible', async () => {
    await renderCoordinator()
    setVisibility('hidden')
    const channel = MockBroadcastChannel.instances[0]

    act(() => {
      channel.onmessage?.(
        new MessageEvent('message', {
          data: {
            version: 1,
            type: 'task-data-changed',
            sourceId: 'tab-b',
            workspaceId: 'workspace-1',
            sentAt: 123,
          },
        }),
      )
    })
    await act(async () => vi.advanceTimersByTimeAsync(2_000))

    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(1)
    expect(mocks.routerInvalidate).not.toHaveBeenCalled()

    setVisibility('visible')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    await act(async () => vi.advanceTimersByTimeAsync(1_000))

    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(2)
    expect(mocks.routerInvalidate).toHaveBeenCalledTimes(1)
  })

  it('does not refresh unrelated routes on activation', async () => {
    await renderCoordinator('/app/workspace/billing')

    act(() => window.dispatchEvent(new Event('focus')))
    await act(async () => vi.advanceTimersByTimeAsync(2_000))

    expect(mocks.invalidateQueries).not.toHaveBeenCalled()
    expect(mocks.routerInvalidate).not.toHaveBeenCalled()
  })

  it('defers activation while offline and refreshes after reconnecting', async () => {
    await renderCoordinator()
    setOnline(false)

    act(() => window.dispatchEvent(new Event('focus')))
    await act(async () => vi.advanceTimersByTimeAsync(2_000))
    expect(mocks.routerInvalidate).not.toHaveBeenCalled()

    setOnline(true)
    act(() => window.dispatchEvent(new Event('online')))
    await act(async () => vi.advanceTimersByTimeAsync(1_000))
    expect(mocks.routerInvalidate).toHaveBeenCalledTimes(1)
  })

  it('prevents overlapping refreshes and runs one trailing refresh', async () => {
    let resolveFirst: (() => void) | undefined
    mocks.invalidateQueries
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockResolvedValue(undefined)
    await renderCoordinator()

    act(() => window.dispatchEvent(new Event('focus')))
    await act(async () => vi.advanceTimersByTimeAsync(1_000))
    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(1)

    act(() => window.dispatchEvent(new Event('focus')))
    await act(async () => vi.advanceTimersByTimeAsync(1_000))
    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveFirst?.()
      await Promise.resolve()
    })
    await act(async () => vi.advanceTimersByTimeAsync(1_000))

    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(2)
    expect(mocks.routerInvalidate).toHaveBeenCalledTimes(2)
  })
})
