import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { getOfflineConfig, getLastOfflineOwner } from './offline-config'
import { readRecords, writeRecords } from './offline-db'
import type { TrackerState } from './types'

/**
 * Encrypted, allowlisted persistence of the Query cache for offline reading
 * and boot (offline-mode REQ-6, REQ-7).
 *
 * Only the member's own data is kept: catalogs, their own entries from the
 * last 14 days, their own recent timesheet weeks, and the session/workspace
 * context needed to open `/app`. Team views, analytics, reports, other
 * members' rows and billing are never written. Records live in the owner's
 * encrypted `cache` store and expire 30 days after they were saved.
 */

export const OWN_ENTRY_DAYS = 14
export const TIMESHEET_DAYS = 35
export const RETENTION_DAYS = 30
export const STALE_CATALOG_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000
const SNAPSHOT_ID = 'snapshot'

type CachedQuery = { key: QueryKey; data: unknown; savedAt: string }

/** The `/app` loader result plus what is needed to check it offline. */
export type AppSnapshot<T = unknown> = {
  savedAt: string
  owner: string
  userId: string
  data: T
}

// ── Allowlist and trimming ────────────────────────────────────────────────────

/** Query roots that may be persisted; everything else is never written. */
const ALLOWED_ROOTS = new Set([
  'session',
  'self-profile',
  'workspace-subscription',
  'workspace-authorization',
  'tracker-state',
  'timesheet',
])

export function trimTrackerState(state: TrackerState, now = Date.now()) {
  const me = state.currentMemberId
  const since = now - OWN_ENTRY_DAYS * DAY_MS
  return {
    ...state,
    members: state.members.filter((m) => m.id === me),
    memberClientBillableRates: state.memberClientBillableRates.filter(
      (r) => r.workspaceMemberId === me,
    ),
    cohorts: [],
    entries: state.entries.filter(
      (e) =>
        e.workspaceMemberId === me &&
        Date.parse(e.endedAt ?? e.startedAt) >= since,
    ),
  }
}

type TimesheetLike = {
  weekStart: string
  viewer?: { memberId: string }
  members: Array<{
    id: string
    days: Array<{ completedSeconds: number; snapshotSeconds: number }>
    weeklySeconds: number
  }>
  memberOptions: Array<{ id: string }>
}

/** Own row only, recent weeks only, default (unfiltered) view only. */
export function trimTimesheet(
  deps: Record<string, unknown> | undefined,
  data: TimesheetLike,
  memberId: string,
  now = Date.now(),
) {
  if (deps && (deps.memberId || deps.departmentId || deps.q)) return null
  if (Date.parse(data.weekStart) < now - TIMESHEET_DAYS * DAY_MS) return null
  const own = data.members.filter((m) => m.id === memberId)
  if (own.length === 0) return null
  return {
    ...data,
    members: own,
    memberOptions: data.memberOptions.filter((m) => m.id === memberId),
    dailyTotals: own[0].days.map((d) => d.snapshotSeconds),
    weeklyTotalSeconds: own[0].weeklySeconds,
    totalCount: 1,
    page: 1,
    totalPages: 1,
  }
}

type SessionLike = {
  user?: Record<string, unknown>
  session?: Record<string, unknown>
} | null

/** Drops the session token and anything not needed to recognise the user. */
export function trimSession(session: SessionLike) {
  if (!session?.user) return null
  const { id, name, email, image, emailVerified } = session.user
  return {
    user: { id, name, email, image, emailVerified },
    session: {
      userId: session.session?.userId,
      expiresAt: session.session?.expiresAt,
    },
  }
}

/**
 * What may be stored for this query, already trimmed, or `undefined` when the
 * query must not be persisted at all.
 */
export function persistableData(
  key: QueryKey,
  data: unknown,
  owner: string,
  now = Date.now(),
): unknown {
  const root = typeof key[0] === 'string' ? key[0] : ''
  if (!ALLOWED_ROOTS.has(root) || data == null) return undefined
  const memberId = owner.split(':')[1]
  switch (root) {
    case 'tracker-state': {
      if (key.length !== 1) return undefined
      const state = data as TrackerState
      if (`${state.workspace.id}:${state.currentMemberId}` !== owner) {
        return undefined
      }
      return trimTrackerState(state, now)
    }
    case 'timesheet':
      return (
        trimTimesheet(
          key[1] as Record<string, unknown> | undefined,
          data as TimesheetLike,
          memberId,
          now,
        ) ?? undefined
      )
    case 'session':
      return trimSession(data as SessionLike) ?? undefined
    case 'workspace-authorization': {
      const access = data as {
        workspace?: { id: string }
        member?: { id: string }
      }
      return access.workspace &&
        access.member &&
        `${access.workspace.id}:${access.member.id}` === owner
        ? data
        : undefined
    }
    default:
      return data
  }
}

const queryRecordId = (key: QueryKey) => `q:${JSON.stringify(key)}`

// ── Writing ───────────────────────────────────────────────────────────────────

/** The owner whose `/app` loaded successfully in this tab, if any. */
let onlineOwner: string | null = null
let sweep: (() => void) | null = null
export function setOnlineCacheOwner(owner: string | null) {
  onlineOwner = owner
  // Server-rendered queries arrive by hydration, not as fetch events.
  sweep?.()
}

async function saveQuery(owner: string, key: QueryKey, data: unknown) {
  const value = persistableData(key, data, owner)
  if (value === undefined) return
  const record: CachedQuery = {
    key,
    data: value,
    savedAt: new Date().toISOString(),
  }
  await writeRecords(owner, [
    { store: 'cache', id: queryRecordId(key), value: record },
  ])
}

/**
 * Persists allowlisted queries as they succeed. Returns an unsubscribe
 * function. Writes are debounced per key and skipped when the cache switch is
 * off or no `/app` session has loaded in this tab.
 */
export function startQueryPersistence(queryClient: QueryClient) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const schedule = (query: {
    queryKey: QueryKey
    state: { data: unknown }
  }) => {
    const owner = onlineOwner
    if (!owner || !getOfflineConfig().cache) return
    const { queryKey } = query
    const root = typeof queryKey[0] === 'string' ? queryKey[0] : ''
    if (!ALLOWED_ROOTS.has(root)) return
    const id = queryRecordId(queryKey)
    const pending = timers.get(id)
    if (pending) clearTimeout(pending)
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id)
        void saveQuery(owner, queryKey, query.state.data).catch(
          (err: unknown) => console.warn('Offline cache write failed', err),
        )
      }, 1000),
    )
  }
  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'updated' && event.action.type === 'success') {
      schedule(event.query)
    }
  })
  sweep = () => {
    for (const query of queryClient.getQueryCache().getAll()) {
      if (query.state.status === 'success') schedule(query)
    }
  }
  sweep()
  return () => {
    unsubscribe()
    sweep = null
    for (const timer of timers.values()) clearTimeout(timer)
  }
}

export async function saveAppSnapshot<T>(
  owner: string,
  userId: string,
  data: T,
): Promise<void> {
  if (!getOfflineConfig().cache) return
  const snapshot: AppSnapshot<T> = {
    savedAt: new Date().toISOString(),
    owner,
    userId,
    data,
  }
  await writeRecords(owner, [
    { store: 'cache', id: SNAPSHOT_ID, value: snapshot },
  ])
}

// ── Reading ───────────────────────────────────────────────────────────────────

async function readCache(owner: string) {
  const { records } = await readRecords<CachedQuery | AppSnapshot>(
    owner,
    'cache',
  )
  return records
}

export type SnapshotState<T = unknown> =
  | { status: 'ok'; snapshot: AppSnapshot<T> }
  | { status: 'expired'; snapshot: AppSnapshot<T> }
  | { status: 'none' }

/**
 * The last online `/app` load for the device's offline owner, and whether it
 * is still within the grace window.
 */
export async function loadAppSnapshot<T>(
  now = Date.now(),
): Promise<SnapshotState<T>> {
  const owner = getLastOfflineOwner()
  if (!owner || !getOfflineConfig().cache) return { status: 'none' }
  try {
    const record = (await readCache(owner)).find((r) => r.id === SNAPSHOT_ID)
    if (!record) return { status: 'none' }
    const snapshot = record.value as AppSnapshot<T>
    const graceMs = getOfflineConfig().graceHours * 60 * 60 * 1000
    return now - Date.parse(snapshot.savedAt) <= graceMs
      ? { status: 'ok', snapshot }
      : { status: 'expired', snapshot }
  } catch {
    return { status: 'none' }
  }
}

/**
 * Loads the owner's persisted queries into the Query cache (with their saved
 * time, so they refetch once online) and deletes records past retention.
 * Returns the oldest catalog save time, for the stale indicator.
 */
export async function restorePersistedQueries(
  queryClient: QueryClient,
  owner: string,
  now = Date.now(),
): Promise<{ restored: number; trackerSavedAt: string | null }> {
  const records = await readCache(owner)
  const expired: string[] = []
  let restored = 0
  let trackerSavedAt: string | null = null
  for (const record of records) {
    if (record.id === SNAPSHOT_ID) continue
    const cached = record.value as CachedQuery
    const age = now - Date.parse(cached.savedAt)
    if (!(age <= RETENTION_DAYS * DAY_MS)) {
      expired.push(record.id)
      continue
    }
    if (queryClient.getQueryData(cached.key) === undefined) {
      queryClient.setQueryData(cached.key, cached.data, {
        updatedAt: Date.parse(cached.savedAt),
      })
      restored += 1
    }
    if (cached.key[0] === 'tracker-state') trackerSavedAt = cached.savedAt
  }
  if (expired.length) {
    await writeRecords(
      owner,
      expired.map((id) => ({ store: 'cache' as const, id, value: undefined })),
    ).catch(() => undefined)
  }
  return { restored, trackerSavedAt }
}

let catalogSavedAt: string | null = null
export function getCatalogSavedAt() {
  return catalogSavedAt
}
export function setCatalogSavedAt(value: string | null) {
  catalogSavedAt = value
}

export function isCatalogStale(savedAt: string | null, now = Date.now()) {
  return (
    savedAt !== null && now - Date.parse(savedAt) > STALE_CATALOG_DAYS * DAY_MS
  )
}
