import { z } from 'zod'
import type { TimeEntry } from './types'
import {
  isOfflineStorageAvailable,
  readRecords,
  requestPersistence,
  writeRecords,
} from './offline-db'
import type { RecordWrite } from './offline-db'
import type { OfflineQueueItem } from './offline-queue-types'

/**
 * Owner-scoped, in-memory mirror of the encrypted offline stores
 * (offline-mode REQ-1). Reads are synchronous so optimistic UI never waits on
 * IndexedDB; every write updates the mirror and then commits to IndexedDB,
 * reverting the mirror and rejecting if the commit fails, so callers never
 * report a save that did not happen.
 */

export type QueuedItem = OfflineQueueItem & {
  seq: number
  capturedAt: string
  /** Server minus device clock at capture time, when known. */
  clockOffsetMs?: number
  attempts?: number
  /** Set before a replay request is sent; cleared when the item is removed. */
  inFlightSince?: string
  /** The device clock was off by more than the limit; the user must confirm. */
  needsConfirmation?: boolean
  /** The user accepted sending the clock-corrected times. */
  clockConfirmed?: boolean
}

export type NeedsReviewItem = {
  id: string
  reason: 'rejected' | 'corrupt'
  message: string
  attempts: number
  firstFailedAt: string
  lastFailedAt: string
  /** Null when the stored record could not be decrypted or parsed. */
  item: QueuedItem | null
}

export type OwnerMeta = {
  idMap: Record<string, string>
  lastSyncAt: string | null
  migratedV1: boolean
}

export type OwnerState = {
  ready: boolean
  /** False when IndexedDB or WebCrypto is unavailable: capture is blocked. */
  available: boolean
  queue: QueuedItem[]
  needsReview: NeedsReviewItem[]
  pendingDisplay: TimeEntry[]
  meta: OwnerMeta
}

const EMPTY_META: OwnerMeta = { idMap: {}, lastSyncAt: null, migratedV1: false }
const META_ID = 'meta'

function emptyState(): OwnerState {
  return {
    ready: false,
    available: isOfflineStorageAvailable(),
    queue: [],
    needsReview: [],
    pendingDisplay: [],
    meta: EMPTY_META,
  }
}

export const ownerKey = (workspaceId: string, memberId: string) =>
  `${workspaceId}:${memberId}`

// ── Validation (corrupt items are parked, never dropped) ──────────────────────

const queuedItemSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum([
      'startTimer',
      'stopTimer',
      'discardTimer',
      'createManualEntry',
    ]),
    optimisticId: z.string().optional(),
    payload: z.object({}).passthrough(),
    seq: z.number(),
    capturedAt: z.string(),
    clockOffsetMs: z.number().optional(),
    attempts: z.number().optional(),
    inFlightSince: z.string().optional(),
    needsConfirmation: z.boolean().optional(),
  })
  .passthrough()
  .superRefine((item, ctx) => {
    const needsOptimistic =
      item.type === 'startTimer' || item.type === 'createManualEntry'
    if (needsOptimistic && !item.optimisticId) {
      ctx.addIssue({ code: 'custom', message: 'optimisticId missing' })
    }
    if (
      (item.type === 'stopTimer' || item.type === 'discardTimer') &&
      typeof item.payload.id !== 'string'
    ) {
      ctx.addIssue({ code: 'custom', message: 'target id missing' })
    }
  })

function isQueuedItem(value: unknown): value is QueuedItem {
  return queuedItemSchema.safeParse(value).success
}

// ── State and subscriptions ───────────────────────────────────────────────────

const states = new Map<string, OwnerState>()
const hydrations = new Map<string, Promise<OwnerState>>()
const listeners = new Set<() => void>()

export function getOwnerState(owner: string): OwnerState {
  let state = states.get(owner)
  if (!state) {
    state = emptyState()
    states.set(owner, state)
  }
  return state
}

export function subscribeOfflineStore(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function setState(owner: string, next: OwnerState) {
  states.set(owner, next)
  for (const listener of listeners) listener()
}

let seqCounter = 0
export function nextSeq(): number {
  seqCounter = (seqCounter + 1) % 1000
  return Date.now() * 1000 + seqCounter
}

// Writes for one owner commit in order, so a failed write can be reverted
// without clobbering a later one.
const writeChains = new Map<string, Promise<unknown>>()

/**
 * Applies `apply` to the mirror now and commits `writes`. On failure the
 * mirror is restored with `revert` and the error is rethrown.
 */
export function commit(
  owner: string,
  apply: (state: OwnerState) => OwnerState,
  revert: (state: OwnerState) => OwnerState,
  writes: RecordWrite[],
): Promise<void> {
  if (!getOwnerState(owner).available) {
    return Promise.reject(
      new Error('Offline storage is not available in this browser.'),
    )
  }
  setState(owner, apply(getOwnerState(owner)))
  const previous = writeChains.get(owner) ?? Promise.resolve()
  const run = previous
    .catch(() => undefined)
    .then(() => writeRecords(owner, writes))
    .catch((err: unknown) => {
      setState(owner, revert(getOwnerState(owner)))
      throw err
    })
  writeChains.set(owner, run)
  return run
}

/**
 * Mirror-only change, for when IndexedDB is unavailable: online display
 * copies must still render even though nothing can be stored durably.
 */
export function mutateMirror(
  owner: string,
  apply: (state: OwnerState) => OwnerState,
) {
  setState(owner, apply(getOwnerState(owner)))
}

/** Resolves once every pending write for the owner has settled. */
export async function flushWrites(owner: string): Promise<void> {
  await (writeChains.get(owner) ?? Promise.resolve()).catch(() => undefined)
}

// ── Hydration and legacy migration ────────────────────────────────────────────

const legacyQueueKey = (owner: string) => `offline-queue:${owner}`
const legacyPendingKey = (owner: string) => `pending-stopped-entries:${owner}`

function readLegacy<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

/**
 * Moves the pre-IndexedDB `localStorage` queue and display copies into the
 * encrypted stores in one transaction, then removes the legacy keys. Safe to
 * run repeatedly: records are keyed by item id, so a rerun overwrites rather
 * than duplicates, and the legacy keys stay until the transaction commits.
 */
export async function migrateLegacyOfflineStorage(
  owner: string,
  existing: { queue: QueuedItem[]; pendingDisplay: TimeEntry[] },
): Promise<{ queue: QueuedItem[]; pendingDisplay: TimeEntry[] }> {
  if (typeof localStorage === 'undefined') return existing
  const memberId = owner.split(':')[1]
  const legacyQueue = readLegacy<OfflineQueueItem>(legacyQueueKey(owner))
  const legacyPending = readLegacy<TimeEntry>(legacyPendingKey(owner)).filter(
    (entry) => entry.workspaceMemberId === memberId,
  )
  if (legacyQueue.length === 0 && legacyPending.length === 0) return existing

  const known = new Set(existing.queue.map((item) => item.id))
  const now = new Date().toISOString()
  const base = nextSeq()
  const migrated: QueuedItem[] = legacyQueue
    .filter((item) => !known.has(item.id))
    .map((item, index) => ({ ...item, seq: base + index, capturedAt: now }))
  const knownDisplay = new Set(existing.pendingDisplay.map((e) => e.id))
  const migratedDisplay = legacyPending.filter((e) => !knownDisplay.has(e.id))

  await writeRecords(owner, [
    ...migrated.map((item) => ({
      store: 'queue' as const,
      id: item.id,
      seq: item.seq,
      value: item,
    })),
    ...migratedDisplay.map((entry, index) => ({
      store: 'pendingDisplay' as const,
      id: entry.id,
      seq: base + index,
      value: entry,
    })),
  ])
  // Only after the commit: a failure above leaves the legacy keys for a retry.
  localStorage.removeItem(legacyQueueKey(owner))
  localStorage.removeItem(legacyPendingKey(owner))
  return {
    queue: [...existing.queue, ...migrated],
    pendingDisplay: [...existing.pendingDisplay, ...migratedDisplay],
  }
}

async function loadOwner(owner: string): Promise<OwnerState> {
  if (!isOfflineStorageAvailable()) {
    return { ...emptyState(), ready: true, available: false }
  }
  void requestPersistence()
  const [queueResult, reviewResult, displayResult, metaResult] =
    await Promise.all([
      readRecords<unknown>(owner, 'queue'),
      readRecords<NeedsReviewItem>(owner, 'needsReview'),
      readRecords<TimeEntry>(owner, 'pendingDisplay'),
      readRecords<OwnerMeta>(owner, 'meta'),
    ])

  const queue: QueuedItem[] = []
  const needsReview: NeedsReviewItem[] = reviewResult.records.map(
    (r) => r.value,
  )
  const now = new Date().toISOString()
  const park = (id: string, message: string): NeedsReviewItem => ({
    id,
    reason: 'corrupt',
    message,
    attempts: 0,
    firstFailedAt: now,
    lastFailedAt: now,
    item: null,
  })
  for (const record of queueResult.records) {
    if (isQueuedItem(record.value)) queue.push(record.value)
    else needsReview.push(park(record.id, 'This saved item is unreadable.'))
  }
  for (const id of [...queueResult.corrupt, ...reviewResult.corrupt]) {
    needsReview.push(park(id, 'This saved item could not be decrypted.'))
  }

  const migrated = await migrateLegacyOfflineStorage(owner, {
    queue,
    pendingDisplay: displayResult.records.map((r) => r.value),
  })
  const meta = metaResult.records[0]?.value ?? EMPTY_META

  return {
    ready: true,
    available: true,
    queue: migrated.queue.sort((a, b) => a.seq - b.seq),
    needsReview,
    pendingDisplay: migrated.pendingDisplay,
    meta: { ...EMPTY_META, ...meta, migratedV1: true },
  }
}

/** Loads an owner's stores into the mirror once; later calls reuse it. */
export function hydrateOwner(owner: string): Promise<OwnerState> {
  const existing = hydrations.get(owner)
  if (existing) return existing
  const promise = loadOwner(owner)
    .then((loaded) => {
      // Keep anything written to the mirror before hydration finished.
      const current = getOwnerState(owner)
      const merge = <T extends { id: string }>(a: T[], b: T[]) => [
        ...a,
        ...b.filter((x) => !a.some((y) => y.id === x.id)),
      ]
      const next: OwnerState = {
        ...loaded,
        queue: merge(loaded.queue, current.queue).sort((a, b) => a.seq - b.seq),
        needsReview: merge(loaded.needsReview, current.needsReview),
        pendingDisplay: merge(loaded.pendingDisplay, current.pendingDisplay),
      }
      setState(owner, next)
      return next
    })
    .catch((err: unknown) => {
      hydrations.delete(owner)
      const failed = {
        ...getOwnerState(owner),
        ready: true,
        available: false,
      }
      setState(owner, failed)
      console.warn('Offline storage could not be opened', err)
      return failed
    })
  hydrations.set(owner, promise)
  return promise
}

// ── Meta ──────────────────────────────────────────────────────────────────────

export function updateMeta(
  owner: string,
  change: (meta: OwnerMeta) => OwnerMeta,
): Promise<void> {
  const before = getOwnerState(owner).meta
  const after = change(before)
  return commit(
    owner,
    (s) => ({ ...s, meta: after }),
    (s) => ({ ...s, meta: before }),
    [{ store: 'meta', id: META_ID, value: after }],
  )
}

/** Test helper: drop every mirror and hydration. */
export function resetOfflineStoreForTests() {
  states.clear()
  hydrations.clear()
  writeChains.clear()
  for (const listener of listeners) listener()
}

/** Forget all mirrors after a wipe; the next access starts empty. */
export function clearOfflineStoreMirrors() {
  states.clear()
  hydrations.clear()
  writeChains.clear()
  for (const listener of listeners) listener()
}
