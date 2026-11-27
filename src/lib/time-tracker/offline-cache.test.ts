// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteOfflineDatabase,
  readRawRecords,
  resetOfflineDbForTests,
  writeRecords,
} from './offline-db'
import {
  isCatalogStale,
  persistableData,
  restorePersistedQueries,
  saveAppSnapshot,
  setOnlineCacheOwner,
  startQueryPersistence,
  trimTrackerState,
} from './offline-cache'
import {
  resetOfflineConfigForTests,
  setLastOfflineOwner,
  setOfflineConfig,
} from './offline-config'
import { OfflineGateError, bootFromSnapshot } from './offline-boot'
import type { TrackerState } from './types'

/** offline-mode REQ-6, REQ-7: checks C13 and C15. */

const OWNER = 'ws1:me'
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const NOW = Date.parse('2026-11-27T10:00:00Z')
const DAY = 24 * 60 * 60 * 1000

function entry(id: string, memberId: string, daysAgo: number) {
  const startedAt = new Date(NOW - daysAgo * DAY).toISOString()
  return {
    id,
    workspaceMemberId: memberId,
    description: id,
    projectId: 'p1',
    taskId: null,
    tagIds: [],
    billable: false,
    startedAt,
    endedAt: startedAt,
    durationSeconds: 60,
    notes: '',
    entrySource: 'TIMER' as const,
  }
}

const trackerState = {
  workspace: { id: 'ws1' },
  currentMemberId: 'me',
  roles: [],
  departments: [{ id: 'd1' }],
  cohorts: [{ id: 'c1' }],
  projects: [{ id: 'p1' }],
  projectTasks: [],
  clients: [{ id: 'cl1' }],
  tags: [{ id: 't1' }],
  members: [{ id: 'me' }, { id: 'colleague' }],
  memberClientBillableRates: [
    { workspaceMemberId: 'me', clientId: 'cl1', billableRate: 10 },
    { workspaceMemberId: 'colleague', clientId: 'cl1', billableRate: 99 },
  ],
  entries: [
    entry('mine-recent', 'me', 2),
    entry('mine-old', 'me', 20),
    entry('theirs', 'colleague', 1),
  ],
} as unknown as TrackerState

beforeEach(async () => {
  vi.useRealTimers()
  localStorage.clear()
  resetOfflineConfigForTests()
  setOnlineCacheOwner(null)
  await deleteOfflineDatabase()
  resetOfflineDbForTests()
})

describe('what may be stored offline (C15)', () => {
  it('keeps catalogs and own recent entries, drops team data and rates', () => {
    const trimmed = trimTrackerState(trackerState, NOW)
    expect(trimmed.entries.map((e) => e.id)).toEqual(['mine-recent'])
    expect(trimmed.members.map((m) => m.id)).toEqual(['me'])
    expect(trimmed.memberClientBillableRates).toHaveLength(1)
    expect(trimmed.projects).toHaveLength(1)
    expect(trimmed.cohorts).toEqual([])
  })

  it('never persists analytics, reports, team or other members’ state', () => {
    expect(persistableData(['analytics', {}], { x: 1 }, OWNER)).toBeUndefined()
    expect(persistableData(['reports', {}], { x: 1 }, OWNER)).toBeUndefined()
    expect(persistableData(['department-analytics'], {}, OWNER)).toBeUndefined()
    expect(
      persistableData(
        ['tracker-state'],
        { ...trackerState, currentMemberId: 'colleague' },
        OWNER,
      ),
    ).toBeUndefined()
  })

  it('keeps only the own row of the default timesheet view', () => {
    const sheet = {
      weekStart: new Date(NOW - 3 * DAY).toISOString().slice(0, 10),
      members: [
        {
          id: 'me',
          days: [{ completedSeconds: 1, snapshotSeconds: 5 }],
          weeklySeconds: 5,
        },
        {
          id: 'colleague',
          days: [{ completedSeconds: 9, snapshotSeconds: 9 }],
          weeklySeconds: 9,
        },
      ],
      memberOptions: [{ id: 'me' }, { id: 'colleague' }],
    }
    const kept = persistableData(['timesheet', {}], sheet, OWNER, NOW) as {
      members: Array<{ id: string }>
      weeklyTotalSeconds: number
    }
    expect(kept.members.map((m) => m.id)).toEqual(['me'])
    expect(kept.weeklyTotalSeconds).toBe(5)
    expect(
      persistableData(
        ['timesheet', { memberId: 'colleague' }],
        sheet,
        OWNER,
        NOW,
      ),
    ).toBeUndefined()
  })

  it('strips the session token', () => {
    const kept = persistableData(
      ['session'],
      {
        user: { id: 'u1', email: 'me@example.com' },
        session: { token: 'secret-token', userId: 'u1', expiresAt: 'x' },
      },
      OWNER,
    )
    expect(JSON.stringify(kept)).not.toContain('secret-token')
  })

  it('writes allowlisted queries encrypted, after an online /app load', async () => {
    const client = new QueryClient()
    const stop = startQueryPersistence(client)
    client.setQueryData(['analytics', {}], { secret: 'team numbers' })
    await client.fetchQuery({
      queryKey: ['tracker-state'],
      queryFn: async () => trackerState,
    })
    await wait(1200)
    expect(await readRawRecords('cache')).toHaveLength(0) // owner unknown yet

    setOnlineCacheOwner(OWNER) // sweeps the existing cache
    await wait(1200)
    stop()

    const raw = await readRawRecords('cache')
    expect(raw.map((r) => r.id)).toEqual(['q:["tracker-state"]'])
    expect(new TextDecoder().decode(raw[0].data)).not.toContain('mine-recent')
  })

  it('switches persistence off with the cache flag (C12)', async () => {
    setOfflineConfig({ queueV2: true, cache: false, graceHours: 24 })
    const client = new QueryClient()
    const stop = startQueryPersistence(client)
    setOnlineCacheOwner(OWNER)
    client.setQueryData(['tracker-state'], trackerState)
    await wait(1200)
    stop()
    expect(await readRawRecords('cache')).toHaveLength(0)
  })

  it('flags catalogs older than 7 days as stale', () => {
    expect(isCatalogStale(new Date(NOW - 8 * DAY).toISOString(), NOW)).toBe(
      true,
    )
    expect(isCatalogStale(new Date(NOW - 6 * DAY).toISOString(), NOW)).toBe(
      false,
    )
    expect(isCatalogStale(null, NOW)).toBe(false)
  })
})

describe('offline boot (C13)', () => {
  it('opens from a snapshot within grace and restores the cached queries', async () => {
    setLastOfflineOwner(OWNER)
    await saveAppSnapshot(OWNER, 'u1', { workspace: { id: 'ws1' } })
    const client = new QueryClient()
    setOnlineCacheOwner(OWNER)
    const stop = startQueryPersistence(client)
    await client.fetchQuery({
      queryKey: ['tracker-state'],
      queryFn: async () => trackerState,
    })
    await wait(1200)
    stop()

    const fresh = new QueryClient()
    const snapshot = await bootFromSnapshot<{ workspace: { id: string } }>(
      fresh,
    )

    expect(snapshot.data.workspace.id).toBe('ws1')
    expect(
      fresh.getQueryData<{ currentMemberId: string }>(['tracker-state'])
        ?.currentMemberId,
    ).toBe('me')
  })

  it('shows the sign-in gate when the grace window has passed', async () => {
    setLastOfflineOwner(OWNER)
    setOfflineConfig({ queueV2: true, cache: true, graceHours: 1 })
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
    try {
      await saveAppSnapshot(OWNER, 'u1', {})
      vi.setSystemTime(NOW + 2 * 60 * 60 * 1000)
      const error = await bootFromSnapshot(new QueryClient()).catch((e) => e)
      expect(error).toBeInstanceOf(OfflineGateError)
      expect(error.reason).toBe('expired')
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the sign-in gate when this device never opened the app online', async () => {
    const error = await bootFromSnapshot(new QueryClient()).catch((e) => e)
    expect(error).toBeInstanceOf(OfflineGateError)
    expect(error.reason).toBe('none')
  })

  it('drops cached queries older than 30 days', async () => {
    await writeRecords(OWNER, [
      {
        store: 'cache',
        id: 'q:["tracker-state"]',
        value: {
          key: ['tracker-state'],
          data: trackerState,
          savedAt: new Date(NOW - 40 * DAY).toISOString(),
        },
      },
    ])

    const fresh = new QueryClient()
    const result = await restorePersistedQueries(fresh, OWNER, NOW)

    expect(result.restored).toBe(0)
    expect(fresh.getQueryData(['tracker-state'])).toBeUndefined()
    expect(await readRawRecords('cache')).toHaveLength(0)
  })
})
