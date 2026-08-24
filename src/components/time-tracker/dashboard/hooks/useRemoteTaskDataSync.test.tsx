// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mocks must be registered before loading the hook under test.
import { useRemoteTaskDataSync } from './useRemoteTaskDataSync'

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

function remoteChange(
  channel: MockBroadcastChannel,
  workspaceId = 'workspace-1',
) {
  channel.onmessage?.(
    new MessageEvent('message', {
      data: {
        version: 1,
        type: 'task-data-changed',
        sourceId: 'tab-b',
        workspaceId,
        sentAt: Date.now(),
      },
    }),
  )
}

describe('useRemoteTaskDataSync', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let refresh: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    MockBroadcastChannel.instances = []
    Object.defineProperty(window, 'BroadcastChannel', {
      configurable: true,
      value: MockBroadcastChannel,
    })
    setVisibility('visible')
    refresh = vi.fn()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  function renderHook(workspaceId = 'workspace-1') {
    function Probe() {
      useRemoteTaskDataSync(workspaceId, refresh)
      return null
    }
    act(() => {
      root.render(<Probe />)
    })
  }

  it('refreshes after a remote change from another tab', async () => {
    renderHook()
    const channel = MockBroadcastChannel.instances[0]

    act(() => remoteChange(channel))
    expect(refresh).not.toHaveBeenCalled()

    await act(async () => vi.advanceTimersByTimeAsync(300))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('coalesces a stop+start burst into one refresh', async () => {
    renderHook()
    const channel = MockBroadcastChannel.instances[0]

    act(() => {
      remoteChange(channel)
      remoteChange(channel)
      remoteChange(channel)
    })
    await act(async () => vi.advanceTimersByTimeAsync(1_000))

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('ignores changes for other workspaces', async () => {
    renderHook()
    const channel = MockBroadcastChannel.instances[0]

    act(() => remoteChange(channel, 'workspace-2'))
    await act(async () => vi.advanceTimersByTimeAsync(1_000))

    expect(refresh).not.toHaveBeenCalled()
  })

  it('defers remote changes while hidden and refreshes on activation', async () => {
    renderHook()
    const channel = MockBroadcastChannel.instances[0]

    setVisibility('hidden')
    act(() => remoteChange(channel))
    await act(async () => vi.advanceTimersByTimeAsync(1_000))
    expect(refresh).not.toHaveBeenCalled()

    setVisibility('visible')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('stops refreshing after unmount', async () => {
    renderHook()
    const channel = MockBroadcastChannel.instances[0]

    act(() => root.unmount())
    act(() => remoteChange(channel))
    await act(async () => vi.advanceTimersByTimeAsync(1_000))

    expect(refresh).not.toHaveBeenCalled()
  })
})
