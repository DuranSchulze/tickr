import { isNetworkError, reportNetworkFailure } from './connectivity'
import {
  blockedEntryIds,
  parkQueuedItem,
  removeOfflineQueueItem,
  updateQueuedItem,
} from './offline-queue'
import { itemEntryId } from './offline-queue-types'
import { getOwnerState, updateMeta } from './offline-store'
import type { QueuedItem } from './offline-store'
import { removePendingEntry } from './pending-entries'

/**
 * Serial, ordered, single-flight replay of the offline queue
 * (offline-mode REQ-2, REQ-4). Each request carries the queue item id as
 * `clientMutationId`, so a retry after a lost response returns the row the
 * first attempt created. An in-flight marker is written before every request
 * and the item is removed only after the server confirms it.
 */

/** Window event that asks the root coordinator to sync now (e.g. after Retry). */
export const OFFLINE_SYNC_REQUEST_EVENT = 'trackly:offline-sync-request'

export function requestOfflineSync() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(OFFLINE_SYNC_REQUEST_EVENT))
  }
}

/** Captured times are trusted only within this clock difference. */
export const MAX_CLOCK_OFFSET_MS = 5 * 60 * 1000
const LOCK_NAME = 'trackly-offline-replay'
const LEASE_KEY = 'trackly-offline-replay-lease'
const LEASE_MS = 30_000

type CreatedEntry = { id: string }

export type ReplayDeps = {
  startTimer: (data: Record<string, unknown>) => Promise<CreatedEntry>
  createManualEntry: (data: Record<string, unknown>) => Promise<CreatedEntry>
  stopTimer: (data: Record<string, unknown>) => Promise<unknown>
  deleteEntry: (data: { id: string }) => Promise<unknown>
  /** Unauthenticated reachability check. */
  probe: () => Promise<boolean>
  /** Authenticated check: the owner (`workspace:member`) of the session. */
  currentOwner: () => Promise<string | null>
}

export type ReplayResult = {
  status: 'done' | 'offline' | 'wrong-owner' | 'busy' | 'empty'
  replayed: number
  parked: number
}

export { isNetworkError }

function shiftIso(iso: string | undefined, offsetMs: number) {
  if (!iso) return iso
  const time = Date.parse(iso)
  return Number.isFinite(time) ? new Date(time + offsetMs).toISOString() : iso
}

/** Applies the recorded server/device offset to captured timestamps. */
export function normalizeItemTimes(item: QueuedItem): QueuedItem {
  const offset = item.clockOffsetMs ?? 0
  if (!offset) return item
  if (item.type === 'startTimer') {
    return {
      ...item,
      payload: {
        ...item.payload,
        startedAt: shiftIso(item.payload.startedAt, offset),
      },
    }
  }
  if (item.type === 'stopTimer') {
    return {
      ...item,
      payload: {
        ...item.payload,
        endedAt: shiftIso(item.payload.endedAt, offset),
      },
    }
  }
  if (item.type === 'createManualEntry') {
    return {
      ...item,
      payload: {
        ...item.payload,
        startedAt: shiftIso(item.payload.startedAt, offset)!,
        endedAt: shiftIso(item.payload.endedAt, offset)!,
      },
    }
  }
  return item
}

export function needsClockConfirmation(item: QueuedItem): boolean {
  return (
    !item.clockConfirmed &&
    Math.abs(item.clockOffsetMs ?? 0) > MAX_CLOCK_OFFSET_MS
  )
}

// ── Single flight ────────────────────────────────────────────────────────────

let runningInTab = false
const tabId =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : String(Math.random())

function takeLease(): boolean {
  try {
    const raw = localStorage.getItem(LEASE_KEY)
    if (raw) {
      const lease = JSON.parse(raw) as { tab: string; until: number }
      if (lease.tab !== tabId && lease.until > Date.now()) return false
    }
    localStorage.setItem(
      LEASE_KEY,
      JSON.stringify({ tab: tabId, until: Date.now() + LEASE_MS }),
    )
    return true
  } catch {
    return true
  }
}

function releaseLease() {
  try {
    const raw = localStorage.getItem(LEASE_KEY)
    if (raw && (JSON.parse(raw) as { tab: string }).tab === tabId) {
      localStorage.removeItem(LEASE_KEY)
    }
  } catch {
    // best effort
  }
}

async function withReplayLock<T>(run: () => Promise<T>): Promise<T | 'busy'> {
  if (runningInTab) return 'busy'
  runningInTab = true
  try {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
    if (locks?.request) {
      return await locks.request(
        LOCK_NAME,
        { ifAvailable: true },
        async (lock) => (lock ? run() : ('busy' as const)),
      )
    }
    if (!takeLease()) return 'busy'
    try {
      return await run()
    } finally {
      releaseLease()
    }
  } finally {
    runningInTab = false
  }
}

// ── Replay ───────────────────────────────────────────────────────────────────

async function send(
  owner: string,
  item: QueuedItem,
  deps: ReplayDeps,
): Promise<void> {
  const normalized = normalizeItemTimes(item)
  const idMap = getOwnerState(owner).meta.idMap
  const clientMutationId = item.id

  if (normalized.type === 'startTimer') {
    const entry = await deps.startTimer({
      ...normalized.payload,
      clientMutationId,
    })
    // Persist the id mapping before the item disappears, so a stop queued
    // after it still finds its target if the app is killed in between.
    await updateMeta(owner, (meta) => ({
      ...meta,
      idMap: { ...meta.idMap, [normalized.optimisticId]: entry.id },
    }))
    return
  }
  if (normalized.type === 'createManualEntry') {
    const entry = await deps.createManualEntry({
      ...normalized.payload,
      clientMutationId,
    })
    await updateMeta(owner, (meta) => ({
      ...meta,
      idMap: { ...meta.idMap, [normalized.optimisticId]: entry.id },
    }))
    return
  }
  if (normalized.type === 'stopTimer') {
    const { id, ...overrides } = normalized.payload
    // A stop for an already-stopped entry returns null: a no-op success.
    await deps.stopTimer({ id: idMap[id] ?? id, ...overrides })
    return
  }
  const targetId = idMap[normalized.payload.id] ?? normalized.payload.id
  try {
    await deps.deleteEntry({ id: targetId })
  } catch (err) {
    // The first attempt deleted it but its response was lost.
    const message = err instanceof Error ? err.message : ''
    if (!isNetworkError(err) && /not found/i.test(message)) {
      return
    }
    throw err
  }
}

function errorMessage(err: unknown) {
  return err instanceof Error && err.message
    ? err.message
    : 'The server rejected this change.'
}

/**
 * Replays an owner's queue. Stops at the first network failure (items stay
 * queued); a server rejection parks the item in needs-review and blocks the
 * actions that depend on the same entry, while the rest continue.
 */
export async function replayQueue(
  owner: string,
  deps: ReplayDeps,
): Promise<ReplayResult> {
  if (getOwnerState(owner).queue.length === 0) {
    return { status: 'empty', replayed: 0, parked: 0 }
  }

  const result = await withReplayLock(async (): Promise<ReplayResult> => {
    let replayed = 0
    let parked = 0

    if (!(await deps.probe())) {
      return { status: 'offline', replayed, parked }
    }
    let sessionOwner: string | null
    try {
      sessionOwner = await deps.currentOwner()
    } catch (err) {
      if (isNetworkError(err)) {
        reportNetworkFailure()
        return { status: 'offline', replayed, parked }
      }
      sessionOwner = null
    }
    // Never replay one member's work under another identity or workspace.
    if (sessionOwner !== owner) {
      return { status: 'wrong-owner', replayed, parked }
    }

    const blocked = blockedEntryIds(owner)
    for (const snapshot of [...getOwnerState(owner).queue]) {
      const item = getOwnerState(owner).queue.find((i) => i.id === snapshot.id)
      if (!item) continue
      const entryId = itemEntryId(item)
      const createsEntry =
        item.type === 'startTimer' || item.type === 'createManualEntry'

      if (!createsEntry && blocked.has(entryId)) continue
      if (item.needsConfirmation) {
        blocked.add(entryId)
        continue
      }
      if (needsClockConfirmation(item)) {
        await updateQueuedItem(owner, item.id, (i) => ({
          ...i,
          needsConfirmation: true,
        }))
        blocked.add(entryId)
        continue
      }

      await updateQueuedItem(owner, item.id, (i) => ({
        ...i,
        inFlightSince: new Date().toISOString(),
        attempts: (i.attempts ?? 0) + 1,
      }))
      try {
        await send(owner, item, deps)
      } catch (err) {
        if (isNetworkError(err)) {
          reportNetworkFailure()
          return { status: 'offline', replayed, parked }
        }
        await parkQueuedItem(owner, item.id, errorMessage(err))
        if (createsEntry) blocked.add(entryId)
        parked += 1
        continue
      }
      await removeOfflineQueueItem(
        owner.split(':')[0],
        owner.split(':')[1],
        item.id,
      )
      // The synced row replaces the local display copy on the next refetch.
      if (item.type === 'createManualEntry' || item.type === 'discardTimer') {
        removePendingEntry(owner.split(':')[0], owner.split(':')[1], entryId)
      } else if (item.type === 'stopTimer') {
        const realId = getOwnerState(owner).meta.idMap[entryId]
        if (realId && realId !== entryId) {
          removePendingEntry(owner.split(':')[0], owner.split(':')[1], entryId)
        }
      }
      replayed += 1
    }

    // Keep id mappings only while a queued or parked action still needs them.
    const state = getOwnerState(owner)
    const stillReferenced = new Set([
      ...state.queue.map(itemEntryId),
      ...state.needsReview.flatMap((r) =>
        r.item ? [itemEntryId(r.item)] : [],
      ),
    ])
    await updateMeta(owner, (meta) => ({
      ...meta,
      lastSyncAt: new Date().toISOString(),
      idMap: Object.fromEntries(
        Object.entries(meta.idMap).filter(([id]) => stillReferenced.has(id)),
      ),
    }))
    return { status: 'done', replayed, parked }
  })

  return result === 'busy' ? { status: 'busy', replayed: 0, parked: 0 } : result
}
