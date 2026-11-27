// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteOfflineDatabase } from '#/lib/time-tracker/offline-db'
import {
  getOwnerState,
  hydrateOwner,
  resetOfflineStoreForTests,
} from '#/lib/time-tracker/offline-store'
import { enqueueOfflineMutation } from '#/lib/time-tracker/offline-queue'
import { setLastOfflineOwner } from '#/lib/time-tracker/offline-config'
import { resetConnectivityForTests } from '#/lib/time-tracker/connectivity'

/**
 * offline-mode REQ-4, check C9: replay runs from the root shell, with no
 * tracker dashboard mounted, when connectivity returns.
 */

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const server = vi.hoisted(() => ({
  createManualEntryFn: vi.fn(async () => ({ id: 'server-1' })),
  startTimerFn: vi.fn(),
  stopTimerFn: vi.fn(),
  deleteEntryFn: vi.fn(),
  getWorkspaceAccessFn: vi.fn(async () => ({
    workspace: { id: 'ws1' },
    member: { id: 'm1' },
  })),
  getOfflineConfigFn: vi.fn(async () => ({
    queueV2: true,
    cache: true,
    graceHours: 24,
  })),
}))
vi.mock('#/lib/server/tracker', () => server)
vi.mock('#/lib/server/workspace-access', () => server)
vi.mock('#/lib/server/offline-config', () => server)
vi.mock('#/lib/time-tracker/task-sync', () => ({
  publishTaskDataChange: vi.fn(),
}))
const routerInvalidate = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ invalidate: routerInvalidate }),
}))
vi.mock('./OfflineSaveErrorDialog', () => ({
  OfflineSaveErrorDialog: () => null,
}))

const { OfflineSyncCoordinator } = await import('./OfflineSyncCoordinator')

const OWNER = 'ws1:m1'
let root: ReturnType<typeof createRoot> | null = null

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => value,
  })
}

beforeEach(async () => {
  localStorage.clear()
  resetConnectivityForTests()
  resetOfflineStoreForTests()
  await deleteOfflineDatabase()
  vi.clearAllMocks()
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ checkedAt: new Date().toISOString() })),
    ),
  )
})

afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  vi.unstubAllGlobals()
  setNavigatorOnline(true)
})

describe('OfflineSyncCoordinator', () => {
  it('replays the queue on reconnect without the tracker mounted', async () => {
    setNavigatorOnline(false)
    setLastOfflineOwner(OWNER)
    await hydrateOwner(OWNER)
    await enqueueOfflineMutation('ws1', 'm1', {
      type: 'createManualEntry',
      optimisticId: 'optimistic-manual-1',
      payload: {
        description: 'From the timesheet screen',
        projectId: 'p1',
        taskId: null,
        tagIds: [],
        billable: false,
        startedAt: '2026-11-27T01:00:00.000Z',
        endedAt: '2026-11-27T02:00:00.000Z',
        durationSeconds: 3600,
        notes: '',
      },
    })

    root = createRoot(document.createElement('div'))
    await act(async () => {
      root?.render(
        <QueryClientProvider client={new QueryClient()}>
          <OfflineSyncCoordinator />
        </QueryClientProvider>,
      )
    })
    expect(server.createManualEntryFn).not.toHaveBeenCalled()

    await act(async () => {
      setNavigatorOnline(true)
      window.dispatchEvent(new Event('online'))
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    expect(server.createManualEntryFn).toHaveBeenCalledTimes(1)
    expect(getOwnerState(OWNER).queue).toHaveLength(0)
    expect(routerInvalidate).toHaveBeenCalled()
  })

  it('stays idle for visitors who never used the tracker', async () => {
    root = createRoot(document.createElement('div'))
    await act(async () => {
      root?.render(
        <QueryClientProvider client={new QueryClient()}>
          <OfflineSyncCoordinator />
        </QueryClientProvider>,
      )
    })
    expect(fetch).not.toHaveBeenCalled()
  })
})
