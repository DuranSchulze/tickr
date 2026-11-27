// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteOfflineDatabase, resetOfflineDbForTests } from './offline-db'
import {
  flushWrites,
  getOwnerState,
  hydrateOwner,
  resetOfflineStoreForTests,
} from './offline-store'
import {
  enqueueOfflineMutation,
  loadOfflineQueue,
  retryParkedItem,
  updateQueuedItem,
} from './offline-queue'
import { needsClockConfirmation, replayQueue } from './offline-replay'
import type { ReplayDeps } from './offline-replay'
import { resetConnectivityForTests } from './connectivity'
import { resetOfflineConfigForTests, setOfflineConfig } from './offline-config'

/** offline-mode REQ-2, REQ-3, REQ-4: checks C6, C7, C8, C10. */

const WS = 'ws1'
const MEMBER = 'm1'
const OWNER = `${WS}:${MEMBER}`

/** A fake server that dedupes on clientMutationId like the real one. */
function fakeServer() {
  const rows = new Map<string, { id: string; mutationId?: string }>()
  let next = 1
  const create = (data: Record<string, unknown>) => {
    const mutationId = data.clientMutationId as string | undefined
    for (const row of rows.values()) {
      if (mutationId && row.mutationId === mutationId) return row
    }
    const row = { id: `server-${next++}`, mutationId }
    rows.set(row.id, row)
    return row
  }
  const deps: ReplayDeps = {
    startTimer: vi.fn(async (data) => create(data)),
    createManualEntry: vi.fn(async (data) => create(data)),
    stopTimer: vi.fn(async () => null),
    deleteEntry: vi.fn(async ({ id }) => {
      if (!rows.delete(id)) throw new Error('Time entry not found.')
    }),
    probe: vi.fn(async () => true),
    currentOwner: vi.fn(async () => OWNER),
  }
  return { rows, deps }
}

const manual = (description: string) => ({
  type: 'createManualEntry' as const,
  optimisticId: `optimistic-manual-${description}`,
  payload: {
    description,
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

const start = (optimisticId: string) => ({
  type: 'startTimer' as const,
  optimisticId,
  payload: {
    description: 'Site visit',
    projectId: 'p1',
    taskId: null,
    tagIds: [],
    billable: false,
    startedAt: '2026-11-27T01:00:00.000Z',
  },
})

const stop = (id: string) => ({
  type: 'stopTimer' as const,
  payload: { id, endedAt: '2026-11-27T03:00:00.000Z' },
})

async function reload() {
  await flushWrites(OWNER)
  resetOfflineStoreForTests()
  resetOfflineDbForTests()
  await hydrateOwner(OWNER)
}

beforeEach(async () => {
  localStorage.clear()
  resetOfflineConfigForTests()
  resetConnectivityForTests()
  resetOfflineStoreForTests()
  await deleteOfflineDatabase()
  await hydrateOwner(OWNER)
})

describe('idempotent replay (C6)', () => {
  it('sends each item with its queue id and empties the queue', async () => {
    const { rows, deps } = fakeServer()
    const queued = await enqueueOfflineMutation(WS, MEMBER, manual('a'))

    const result = await replayQueue(OWNER, deps)

    expect(result).toMatchObject({ status: 'done', replayed: 1 })
    expect(deps.createManualEntry).toHaveBeenCalledWith(
      expect.objectContaining({ clientMutationId: queued.id }),
    )
    expect(rows.size).toBe(1)
    expect(loadOfflineQueue(WS, MEMBER)).toHaveLength(0)
  })

  it('creates one row when the first response is lost after commit', async () => {
    const { rows, deps } = fakeServer()
    await enqueueOfflineMutation(WS, MEMBER, manual('lost'))
    const realCreate = deps.createManualEntry
    deps.createManualEntry = vi.fn(async (data) => {
      await realCreate(data) // committed on the server...
      throw new TypeError('Failed to fetch') // ...but the response is lost
    })

    expect((await replayQueue(OWNER, deps)).status).toBe('offline')
    expect(loadOfflineQueue(WS, MEMBER)).toHaveLength(1)

    deps.createManualEntry = realCreate
    await replayQueue(OWNER, deps)

    expect(rows.size).toBe(1)
    expect(loadOfflineQueue(WS, MEMBER)).toHaveLength(0)
  })

  it('retries an in-flight item with the same id after the app is killed', async () => {
    const { rows, deps } = fakeServer()
    const queued = await enqueueOfflineMutation(WS, MEMBER, manual('killed'))
    await updateQueuedItem(OWNER, queued.id, (i) => ({
      ...i,
      inFlightSince: new Date().toISOString(),
    }))
    // The server already has the row from the attempt that was in flight.
    rows.set('server-0', { id: 'server-0', mutationId: queued.id })

    await reload()
    expect(loadOfflineQueue(WS, MEMBER)[0].inFlightSince).toBeDefined()
    await replayQueue(OWNER, deps)

    expect(rows.size).toBe(1)
    expect(loadOfflineQueue(WS, MEMBER)).toHaveLength(0)
  })

  it('maps a queued stop onto the replayed start, in order', async () => {
    const { deps } = fakeServer()
    await enqueueOfflineMutation(WS, MEMBER, start('optimistic-t1'))
    await enqueueOfflineMutation(WS, MEMBER, stop('optimistic-t1'))

    await replayQueue(OWNER, deps)

    expect(deps.stopTimer).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'server-1' }),
    )
  })

  it('sends each item once when two replays race', async () => {
    const { rows, deps } = fakeServer()
    for (const d of ['a', 'b', 'c']) {
      await enqueueOfflineMutation(WS, MEMBER, manual(d))
    }

    const results = await Promise.all([
      replayQueue(OWNER, deps),
      replayQueue(OWNER, deps),
    ])

    expect(results.map((r) => r.status).sort()).toEqual(['busy', 'done'])
    expect(deps.createManualEntry).toHaveBeenCalledTimes(3)
    expect(rows.size).toBe(3)
  })

  it('treats a lost delete response as done on retry', async () => {
    const { deps } = fakeServer()
    await enqueueOfflineMutation(WS, MEMBER, {
      type: 'discardTimer',
      payload: { id: 'already-gone' },
    })

    const result = await replayQueue(OWNER, deps)

    expect(result).toMatchObject({ status: 'done', parked: 0 })
    expect(loadOfflineQueue(WS, MEMBER)).toHaveLength(0)
  })
})

describe('clock offset (C7)', () => {
  it('holds an item captured with a 2 h clock error for confirmation', async () => {
    const { deps } = fakeServer()
    const queued = await enqueueOfflineMutation(WS, MEMBER, manual('skewed'))
    await updateQueuedItem(OWNER, queued.id, (i) => ({
      ...i,
      clockOffsetMs: -2 * 60 * 60 * 1000,
    }))

    await replayQueue(OWNER, deps)

    expect(deps.createManualEntry).not.toHaveBeenCalled()
    const [item] = loadOfflineQueue(WS, MEMBER)
    expect(item.needsConfirmation).toBe(true)
    expect(needsClockConfirmation(item)).toBe(true)
  })

  it('sends offset-normalized times once confirmed', async () => {
    const { deps } = fakeServer()
    const queued = await enqueueOfflineMutation(WS, MEMBER, manual('fixed'))
    await updateQueuedItem(OWNER, queued.id, (i) => ({
      ...i,
      clockOffsetMs: -2 * 60 * 60 * 1000,
      needsConfirmation: false,
      clockConfirmed: true,
    }))

    await replayQueue(OWNER, deps)

    expect(deps.createManualEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        startedAt: '2026-11-26T23:00:00.000Z',
        endedAt: '2026-11-27T00:00:00.000Z',
      }),
    )
  })

  it('normalizes a small offset without asking', async () => {
    const { deps } = fakeServer()
    const queued = await enqueueOfflineMutation(WS, MEMBER, manual('small'))
    await updateQueuedItem(OWNER, queued.id, (i) => ({
      ...i,
      clockOffsetMs: 3 * 60 * 1000,
    }))

    await replayQueue(OWNER, deps)

    expect(deps.createManualEntry).toHaveBeenCalledWith(
      expect.objectContaining({ startedAt: '2026-11-27T01:03:00.000Z' }),
    )
  })
})

describe('needs-review instead of silent loss (C8)', () => {
  it('parks a rejected start, holds its stop, and syncs the rest', async () => {
    const { deps } = fakeServer()
    await enqueueOfflineMutation(WS, MEMBER, start('optimistic-bad'))
    await enqueueOfflineMutation(WS, MEMBER, stop('optimistic-bad'))
    await enqueueOfflineMutation(WS, MEMBER, manual('fine'))
    deps.startTimer = vi.fn(async () => {
      throw new Error('This project is archived.')
    })

    const result = await replayQueue(OWNER, deps)

    expect(result).toMatchObject({ status: 'done', replayed: 1, parked: 1 })
    const state = getOwnerState(OWNER)
    expect(state.needsReview).toMatchObject([
      { reason: 'rejected', message: 'This project is archived.' },
    ])
    expect(state.queue.map((i) => i.type)).toEqual(['stopTimer'])
    expect(deps.stopTimer).not.toHaveBeenCalled()

    await reload()
    expect(getOwnerState(OWNER).needsReview).toHaveLength(1)
  })

  it('replays a retried item and then its held stop', async () => {
    const { deps } = fakeServer()
    await enqueueOfflineMutation(WS, MEMBER, start('optimistic-retry'))
    await enqueueOfflineMutation(WS, MEMBER, stop('optimistic-retry'))
    const realStart = deps.startTimer
    deps.startTimer = vi.fn(async () => {
      throw new Error('Temporarily rejected')
    })
    await replayQueue(OWNER, deps)

    const [parked] = getOwnerState(OWNER).needsReview
    await retryParkedItem(OWNER, parked.id)
    deps.startTimer = realStart
    await replayQueue(OWNER, deps)

    expect(getOwnerState(OWNER).needsReview).toHaveLength(0)
    expect(loadOfflineQueue(WS, MEMBER)).toHaveLength(0)
    expect(deps.stopTimer).toHaveBeenCalledTimes(1)
  })
})

describe('reachability and identity (C9, C10)', () => {
  it('does nothing when the probe fails, marking nothing failed', async () => {
    const { deps } = fakeServer()
    deps.probe = vi.fn(async () => false)
    await enqueueOfflineMutation(WS, MEMBER, manual('wait'))

    expect((await replayQueue(OWNER, deps)).status).toBe('offline')
    expect(deps.createManualEntry).not.toHaveBeenCalled()
    expect(getOwnerState(OWNER).needsReview).toHaveLength(0)
  })

  it('refuses to replay another member’s queue', async () => {
    const { deps } = fakeServer()
    deps.currentOwner = vi.fn(async () => 'ws1:someone-else')
    await enqueueOfflineMutation(WS, MEMBER, manual('mine'))

    expect((await replayQueue(OWNER, deps)).status).toBe('wrong-owner')
    expect(deps.createManualEntry).not.toHaveBeenCalled()
    expect(loadOfflineQueue(WS, MEMBER)).toHaveLength(1)
  })
})

describe('rollout switch (C12)', () => {
  it('still replays items queued before the queue switch was turned off', async () => {
    const { rows, deps } = fakeServer()
    await enqueueOfflineMutation(WS, MEMBER, manual('before-switch'))
    setOfflineConfig({ queueV2: false, cache: true, graceHours: 24 })

    await replayQueue(OWNER, deps)

    expect(rows.size).toBe(1)
    expect(loadOfflineQueue(WS, MEMBER)).toHaveLength(0)
  })
})
