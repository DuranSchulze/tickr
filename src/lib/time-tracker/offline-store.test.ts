// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as offlineDb from './offline-db'
import {
  deleteOfflineDatabase,
  getOwnerKey,
  readRawRecords,
  writeRecords,
} from './offline-db'
import {
  flushWrites,
  getOwnerState,
  hydrateOwner,
  resetOfflineStoreForTests,
} from './offline-store'
import { enqueueOfflineMutation, loadOfflineQueue } from './offline-queue'
import { resetOfflineConfigForTests, setOfflineConfig } from './offline-config'

/** offline-mode REQ-1: checks C3, C4, C5. */

const WS = 'ws1'
const MEMBER = 'm1'
const OWNER = `${WS}:${MEMBER}`

const manualPayload = {
  description: 'Secret client visit',
  projectId: 'p1',
  taskId: null,
  tagIds: [],
  billable: true,
  startedAt: '2026-11-27T01:00:00.000Z',
  endedAt: '2026-11-27T02:00:00.000Z',
  durationSeconds: 3600,
  notes: 'private note',
}

async function freshDevice() {
  resetOfflineStoreForTests()
  offlineDb.resetOfflineDbForTests()
}

beforeEach(async () => {
  localStorage.clear()
  resetOfflineConfigForTests()
  resetOfflineStoreForTests()
  await deleteOfflineDatabase()
})
afterEach(() => vi.restoreAllMocks())

describe('encrypted offline storage (C3)', () => {
  it('round-trips a queued entry and keeps no plaintext on disk', async () => {
    await hydrateOwner(OWNER)
    await enqueueOfflineMutation(WS, MEMBER, {
      type: 'createManualEntry',
      optimisticId: 'optimistic-manual-1',
      payload: manualPayload,
    })

    const raw = await readRawRecords('queue')
    expect(raw).toHaveLength(1)
    const bytes = new TextDecoder().decode(raw[0].data)
    expect(bytes).not.toContain('Secret client visit')
    expect(bytes).not.toContain('private note')
    expect(JSON.stringify(raw[0])).not.toContain('Secret')

    await freshDevice()
    await hydrateOwner(OWNER)
    const [item] = loadOfflineQueue(WS, MEMBER)
    expect(item.type).toBe('createManualEntry')
    expect(item.payload).toMatchObject({ description: 'Secret client visit' })
  })

  it('uses a non-extractable AES-GCM key per owner', async () => {
    const key = await getOwnerKey(OWNER)
    expect(key.extractable).toBe(false)
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 })
    expect(await getOwnerKey('ws1:other')).not.toBe(key)
  })

  it('keeps queue order across a reload', async () => {
    await hydrateOwner(OWNER)
    for (let i = 0; i < 5; i += 1) {
      await enqueueOfflineMutation(WS, MEMBER, {
        type: 'createManualEntry',
        optimisticId: `optimistic-manual-${i}`,
        payload: { ...manualPayload, description: `entry ${i}` },
      })
    }
    await freshDevice()
    await hydrateOwner(OWNER)
    expect(
      loadOfflineQueue(WS, MEMBER).map(
        (i) => (i.payload as { description: string }).description,
      ),
    ).toEqual(['entry 0', 'entry 1', 'entry 2', 'entry 3', 'entry 4'])
  })
})

describe('legacy localStorage migration (C4)', () => {
  const legacyItems = [
    {
      id: 'legacy-1',
      type: 'startTimer',
      optimisticId: 'optimistic-a',
      payload: { ...manualPayload, startedAt: '2026-11-27T01:00:00.000Z' },
    },
    { id: 'legacy-2', type: 'stopTimer', payload: { id: 'optimistic-a' } },
  ]
  const legacyDisplay = [
    {
      id: 'optimistic-a',
      workspaceMemberId: MEMBER,
      description: 'x',
      projectId: 'p1',
      taskId: null,
      tagIds: [],
      billable: false,
      startedAt: '2026-11-27T01:00:00.000Z',
      endedAt: '2026-11-27T02:00:00.000Z',
      durationSeconds: 3600,
      notes: '',
      entrySource: 'TIMER',
    },
  ]

  function seedLegacy() {
    localStorage.setItem(`offline-queue:${OWNER}`, JSON.stringify(legacyItems))
    localStorage.setItem(
      `pending-stopped-entries:${OWNER}`,
      JSON.stringify(legacyDisplay),
    )
  }

  it('moves items in order and removes the legacy keys after commit', async () => {
    seedLegacy()
    await hydrateOwner(OWNER)

    expect(loadOfflineQueue(WS, MEMBER).map((i) => i.id)).toEqual([
      'legacy-1',
      'legacy-2',
    ])
    expect(getOwnerState(OWNER).pendingDisplay).toHaveLength(1)
    expect(localStorage.getItem(`offline-queue:${OWNER}`)).toBeNull()
    expect(localStorage.getItem(`pending-stopped-entries:${OWNER}`)).toBeNull()
  })

  it('is idempotent when the legacy keys reappear (old tab still open)', async () => {
    seedLegacy()
    await hydrateOwner(OWNER)
    seedLegacy()
    await freshDevice()
    await hydrateOwner(OWNER)

    expect(loadOfflineQueue(WS, MEMBER).map((i) => i.id)).toEqual([
      'legacy-1',
      'legacy-2',
    ])
    expect(await readRawRecords('queue')).toHaveLength(2)
  })

  it('keeps the legacy keys when the IndexedDB commit fails', async () => {
    seedLegacy()
    vi.spyOn(offlineDb, 'writeRecords').mockRejectedValueOnce(
      new Error('QuotaExceededError'),
    )
    await hydrateOwner(OWNER)

    expect(localStorage.getItem(`offline-queue:${OWNER}`)).not.toBeNull()
    expect(getOwnerState(OWNER).available).toBe(false)
  })
})

describe('failures never look like success (C5)', () => {
  it('parks a corrupt record in needs-review instead of dropping it', async () => {
    await writeRecords(OWNER, [
      { store: 'queue', id: 'broken', seq: 1, value: { nonsense: true } },
    ])
    await hydrateOwner(OWNER)

    const state = getOwnerState(OWNER)
    expect(state.queue).toHaveLength(0)
    expect(state.needsReview).toMatchObject([
      { id: 'broken', reason: 'corrupt', item: null },
    ])
    expect(await readRawRecords('queue')).toHaveLength(1)
  })

  it('rejects and restores the mirror when the write fails', async () => {
    await hydrateOwner(OWNER)
    vi.spyOn(offlineDb, 'writeRecords').mockRejectedValueOnce(
      new Error('QuotaExceededError'),
    )
    await expect(
      enqueueOfflineMutation(WS, MEMBER, {
        type: 'createManualEntry',
        optimisticId: 'optimistic-manual-x',
        payload: manualPayload,
      }),
    ).rejects.toThrow('QuotaExceededError')
    await flushWrites(OWNER)
    expect(loadOfflineQueue(WS, MEMBER)).toHaveLength(0)
  })

  it('blocks capture when IndexedDB is unavailable (degraded mode)', async () => {
    vi.spyOn(offlineDb, 'isOfflineStorageAvailable').mockReturnValue(false)
    resetOfflineStoreForTests()
    const state = await hydrateOwner(OWNER)
    expect(state.available).toBe(false)
    await expect(
      enqueueOfflineMutation(WS, MEMBER, {
        type: 'createManualEntry',
        optimisticId: 'optimistic-manual-y',
        payload: manualPayload,
      }),
    ).rejects.toThrow(/not available/)
  })

  it('refuses offline capture when the queue switch is off (C12)', async () => {
    setOfflineConfig({ queueV2: false, cache: true, graceHours: 24 })
    await hydrateOwner(OWNER)
    await expect(
      enqueueOfflineMutation(WS, MEMBER, {
        type: 'createManualEntry',
        optimisticId: 'optimistic-manual-z',
        payload: manualPayload,
      }),
    ).rejects.toThrow(/turned off/)
    expect(loadOfflineQueue(WS, MEMBER)).toHaveLength(0)
  })
})
