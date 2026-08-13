// @vitest-environment jsdom

import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  invalidateTaskDataQueries,
  isTaskDataRoute,
  isTaskSyncMessage,
  notifyTaskSyncCompleted,
  publishTaskDataChange,
  subscribeToTaskDataChanges,
  subscribeToTaskSyncCompleted,
} from './task-sync'

class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = []

  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  posted: unknown[] = []
  closed = false

  constructor(public readonly name: string) {
    MockBroadcastChannel.instances.push(this)
  }

  postMessage(message: unknown) {
    this.posted.push(message)
  }

  close() {
    this.closed = true
  }
}

describe('task-sync', () => {
  beforeEach(() => {
    MockBroadcastChannel.instances = []
    Object.defineProperty(window, 'BroadcastChannel', {
      configurable: true,
      value: MockBroadcastChannel,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('recognizes task routes without matching unrelated app screens', () => {
    expect(isTaskDataRoute('/app/time-tracker')).toBe(true)
    expect(isTaskDataRoute('/app/workspace/catalogs/projects')).toBe(true)
    expect(isTaskDataRoute('/app/department-member-calendar/member-1')).toBe(
      true,
    )
    expect(isTaskDataRoute('/app/workspace/billing')).toBe(false)
    expect(isTaskDataRoute('/auth')).toBe(false)
  })

  it('validates the versioned message envelope', () => {
    expect(
      isTaskSyncMessage({
        version: 1,
        type: 'task-data-changed',
        sourceId: 'tab-b',
        workspaceId: 'workspace-1',
        sentAt: 123,
      }),
    ).toBe(true)
    expect(isTaskSyncMessage({ version: 2 })).toBe(false)
    expect(isTaskSyncMessage({ version: 1, type: 'task-data-changed' })).toBe(
      false,
    )
  })

  it('publishes only the scoped change envelope', () => {
    publishTaskDataChange('workspace-1')

    const channel = MockBroadcastChannel.instances[0]
    expect(channel.name).toBe('tickr:task-data-sync:v1')
    expect(channel.posted).toHaveLength(1)
    expect(channel.posted[0]).toMatchObject({
      version: 1,
      type: 'task-data-changed',
      workspaceId: 'workspace-1',
    })
    expect(channel.posted[0]).not.toHaveProperty('data')
  })

  it('filters malformed and cross-workspace messages and cleans up', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToTaskDataChanges('workspace-1', listener)
    const channel = MockBroadcastChannel.instances.at(-1)!

    channel.onmessage?.(new MessageEvent('message', { data: { version: 2 } }))
    channel.onmessage?.(
      new MessageEvent('message', {
        data: {
          version: 1,
          type: 'task-data-changed',
          sourceId: 'tab-b',
          workspaceId: 'workspace-2',
          sentAt: 123,
        },
      }),
    )
    channel.onmessage?.(
      new MessageEvent('message', {
        data: {
          version: 1,
          type: 'task-data-changed',
          sourceId: 'tab-b',
          workspaceId: 'workspace-1',
          sentAt: 124,
        },
      }),
    )

    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    expect(channel.closed).toBe(true)
  })

  it('falls back safely when BroadcastChannel is unavailable', () => {
    Object.defineProperty(window, 'BroadcastChannel', {
      configurable: true,
      value: undefined,
    })
    const listener = vi.fn()
    const unsubscribe = subscribeToTaskDataChanges('workspace-1', listener)

    expect(() => unsubscribe()).not.toThrow()
    expect(listener).not.toHaveBeenCalled()
  })

  it('invalidates only task-related query families', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(['tracker-state'], { entries: [] })
    queryClient.setQueryData(['analytics', { range: 'week' }], {})
    queryClient.setQueryData(['workspace-subscription'], {})

    await invalidateTaskDataQueries(queryClient, 'none')

    expect(queryClient.getQueryState(['tracker-state'])?.isInvalidated).toBe(
      true,
    )
    expect(
      queryClient.getQueryState(['analytics', { range: 'week' }])
        ?.isInvalidated,
    ).toBe(true)
    expect(
      queryClient.getQueryState(['workspace-subscription'])?.isInvalidated,
    ).toBe(false)
  })

  it('notifies completed-refresh subscribers and removes them cleanly', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToTaskSyncCompleted(listener)

    notifyTaskSyncCompleted({
      workspaceId: 'workspace-1',
      reason: 'activation',
    })
    unsubscribe()
    notifyTaskSyncCompleted({
      workspaceId: 'workspace-1',
      reason: 'online',
    })

    expect(listener).toHaveBeenCalledTimes(1)
  })
})
