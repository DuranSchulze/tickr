// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteOfflineDatabase, readRawRecords } from './offline-db'
import {
  getOwnerState,
  hydrateOwner,
  resetOfflineStoreForTests,
} from './offline-store'
import { enqueueOfflineMutation } from './offline-queue'
import { saveAppSnapshot } from './offline-cache'
import {
  getLastOfflineOwner,
  resetOfflineConfigForTests,
  setLastOfflineOwner,
} from './offline-config'
import {
  countUnsyncedWork,
  exportUnsyncedWork,
  forgetPreviousOwnerIfSynced,
  isSignOutPending,
  markSignOutPending,
  wipeLocalData,
} from './offline-wipe'

/** offline-mode REQ-8 (check C16) and the REQ-6 authorization fallback (C13). */

const access = vi.hoisted(() => ({
  result: null as unknown,
  error: null as unknown,
}))
vi.mock('#/lib/server/workspace-access', () => ({
  getWorkspaceAccessFn: vi.fn(async () => {
    if (access.error) throw access.error
    return access.result
  }),
}))
const { fetchFreshWorkspaceAuthorization, workspaceAuthorizationKeys } =
  await import('./workspace-authorization')

const A = 'ws1:member-a'
const B = 'ws1:member-b'
const manual = {
  type: 'createManualEntry' as const,
  optimisticId: 'optimistic-manual-a',
  payload: {
    description: 'A private visit',
    projectId: 'p1',
    taskId: null,
    tagIds: [],
    billable: false,
    startedAt: '2026-11-27T01:00:00.000Z',
    endedAt: '2026-11-27T02:00:00.000Z',
    durationSeconds: 3600,
    notes: '',
  },
}

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  resetOfflineConfigForTests()
  resetOfflineStoreForTests()
  await deleteOfflineDatabase()
  access.result = null
  access.error = null
})

describe('wipeLocalData (C16)', () => {
  it('removes queue, cache, keys, snapshot and offline settings', async () => {
    setLastOfflineOwner(A)
    await hydrateOwner(A)
    await enqueueOfflineMutation('ws1', 'member-a', manual)
    await saveAppSnapshot(A, 'user-a', { workspace: { id: 'ws1' } })
    localStorage.setItem('offline-queue:ws1:member-a', '[]')
    localStorage.setItem('theme', 'dark')
    const client = new QueryClient()
    client.setQueryData(['tracker-state'], { secret: true })

    await wipeLocalData(client)

    resetOfflineStoreForTests()
    expect(await readRawRecords('queue')).toHaveLength(0)
    expect(await readRawRecords('cache')).toHaveLength(0)
    expect(getLastOfflineOwner()).toBeNull()
    expect(localStorage.getItem('offline-queue:ws1:member-a')).toBeNull()
    expect(localStorage.getItem('theme')).toBe('dark') // unrelated settings stay
    expect(client.getQueryData(['tracker-state'])).toBeUndefined()
    expect((await hydrateOwner(A)).queue).toHaveLength(0)
  })

  it('counts and exports unsynced work before logout', async () => {
    await hydrateOwner(A)
    await enqueueOfflineMutation('ws1', 'member-a', manual)

    expect(await countUnsyncedWork(A)).toBe(1)
    const exported = JSON.parse(await exportUnsyncedWork(A).text())
    expect(exported.pending[0].payload.description).toBe('A private visit')
  })

  it('remembers an offline logout until the server session is ended', () => {
    expect(isSignOutPending()).toBe(false)
    markSignOutPending()
    expect(isSignOutPending()).toBe(true)
  })
})

describe('shared device (C16)', () => {
  it('forgets a previous member’s synced data but keeps unsynced work', async () => {
    await saveAppSnapshot(A, 'user-a', {})
    await forgetPreviousOwnerIfSynced(B)
    expect(await readRawRecords('cache')).toHaveLength(0)

    await saveAppSnapshot(A, 'user-a', {})
    resetOfflineStoreForTests()
    await hydrateOwner(A)
    await enqueueOfflineMutation('ws1', 'member-a', manual)
    resetOfflineStoreForTests()
    await forgetPreviousOwnerIfSynced(B)
    expect(await readRawRecords('cache')).toHaveLength(1)
    expect(getOwnerState(B).queue).toHaveLength(0) // never shown to B
  })
})

describe('fetchFreshWorkspaceAuthorization offline fallback (C13)', () => {
  const cached = { workspace: { id: 'ws1' }, member: { id: 'member-a' } }

  it('uses the restored copy when the request never reached the server', async () => {
    const client = new QueryClient()
    client.setQueryData(workspaceAuthorizationKeys.current(), cached)
    access.error = new TypeError('Failed to fetch')

    await expect(fetchFreshWorkspaceAuthorization(client)).resolves.toEqual(
      cached,
    )
  })

  it('never masks a server answer such as revoked access', async () => {
    const client = new QueryClient()
    client.setQueryData(workspaceAuthorizationKeys.current(), cached)
    access.error = new Error('You no longer have access to this workspace.')

    await expect(fetchFreshWorkspaceAuthorization(client)).rejects.toThrow(
      'no longer have access',
    )
  })
})
