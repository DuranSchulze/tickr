import type { DeviceLocation } from './device-location'
import { getClockOffsetMs } from './connectivity'
import { getOfflineConfig } from './offline-config'
import { itemEntryId } from './offline-queue-types'
import type { EnqueueInput, OfflineQueueItem } from './offline-queue-types'
import { commit, getOwnerState, nextSeq, ownerKey } from './offline-store'
import type { NeedsReviewItem, OwnerState, QueuedItem } from './offline-store'

export type { EnqueueInput, OfflineQueueItem } from './offline-queue-types'

/**
 * Durable offline mutation queue (offline-mode REQ-1). Reads come from the
 * synchronous mirror in `offline-store`; writes resolve only after the
 * encrypted IndexedDB commit, and reject (with the mirror restored) when it
 * fails, so callers must not report success before the promise resolves.
 */

const queueWrite = (item: QueuedItem) => ({
  store: 'queue' as const,
  id: item.id,
  seq: item.seq,
  value: item,
})
const queueDelete = (id: string) => ({
  store: 'queue' as const,
  id,
  value: undefined,
})

export async function enqueueOfflineMutation(
  workspaceId: string,
  memberId: string,
  input: EnqueueInput,
): Promise<OfflineQueueItem> {
  // REQ-10: with the switch off, offline capture is refused (the caller keeps
  // the input and shows why); items already queued still replay.
  if (!getOfflineConfig().queueV2) {
    throw new Error(
      'Offline capture is turned off. Reconnect to save this change.',
    )
  }
  const owner = ownerKey(workspaceId, memberId)
  const queued = {
    ...input,
    id: crypto.randomUUID(),
    seq: nextSeq(),
    capturedAt: new Date().toISOString(),
    clockOffsetMs: getClockOffsetMs() ?? undefined,
  } as QueuedItem
  await commit(
    owner,
    (s) => ({ ...s, queue: [...s.queue, queued] }),
    (s) => ({ ...s, queue: s.queue.filter((i) => i.id !== queued.id) }),
    [queueWrite(queued)],
  )
  return queued
}

export function loadOfflineQueue(
  workspaceId: string,
  memberId: string,
): QueuedItem[] {
  return getOwnerState(ownerKey(workspaceId, memberId)).queue
}

/** Entry ids whose local display copies must be retained until replay ends. */
export function getQueuedEntryIds(
  workspaceId: string,
  memberId: string,
): Set<string> {
  const state = getOwnerState(ownerKey(workspaceId, memberId))
  const ids = new Set<string>()
  for (const item of state.queue) ids.add(itemEntryId(item))
  // Parked items still own their display copy until retried or discarded.
  for (const review of state.needsReview) {
    if (review.item) ids.add(itemEntryId(review.item))
  }
  return ids
}

export function removeOfflineQueueItem(
  workspaceId: string,
  memberId: string,
  itemId: string,
): Promise<void> {
  const owner = ownerKey(workspaceId, memberId)
  const removed = getOwnerState(owner).queue.find((i) => i.id === itemId)
  if (!removed) return Promise.resolve()
  return commit(
    owner,
    (s) => ({ ...s, queue: s.queue.filter((i) => i.id !== itemId) }),
    (s) => ({
      ...s,
      queue: [...s.queue, removed].sort((a, b) => a.seq - b.seq),
    }),
    [queueDelete(itemId)],
  )
}

/** Replaces one queued item (attempts, in-flight marker, location, ...). */
export function updateQueuedItem(
  owner: string,
  itemId: string,
  change: (item: QueuedItem) => QueuedItem,
): Promise<void> {
  const before = getOwnerState(owner).queue.find((i) => i.id === itemId)
  if (!before) return Promise.resolve()
  const after = change(before)
  const swap = (from: QueuedItem, to: QueuedItem) => (s: OwnerState) => ({
    ...s,
    queue: s.queue.map((i) => (i.id === from.id ? to : i)),
  })
  return commit(owner, swap(before, after), swap(after, before), [
    queueWrite(after),
  ])
}

export function setOfflineEntryDeviceLocation(
  workspaceId: string,
  memberId: string,
  itemId: string,
  deviceLocation: DeviceLocation,
): Promise<void> {
  return updateQueuedItem(ownerKey(workspaceId, memberId), itemId, (item) =>
    item.type === 'startTimer' || item.type === 'createManualEntry'
      ? ({
          ...item,
          payload: { ...item.payload, deviceLocation },
        } as QueuedItem)
      : item,
  )
}

/** True when a startTimer for this optimistic entry is still waiting to sync. */
export function hasQueuedStart(
  workspaceId: string,
  memberId: string,
  optimisticId: string,
): boolean {
  const state = getOwnerState(ownerKey(workspaceId, memberId))
  return (
    state.queue.some(
      (i) => i.type === 'startTimer' && i.optimisticId === optimisticId,
    ) ||
    state.needsReview.some(
      (r) =>
        r.item?.type === 'startTimer' && r.item.optimisticId === optimisticId,
    )
  )
}

/**
 * Drops every queued or parked action tied to the given entry id (queued
 * start plus any stop/discard referencing it). Used when an offline-started
 * timer is discarded before it ever reached the server.
 */
export function removeQueuedItemsForEntry(
  workspaceId: string,
  memberId: string,
  entryId: string,
): Promise<void> {
  const owner = ownerKey(workspaceId, memberId)
  const state = getOwnerState(owner)
  const queued = state.queue.filter((i) => itemEntryId(i) === entryId)
  const parked = state.needsReview.filter(
    (r) => r.item && itemEntryId(r.item) === entryId,
  )
  if (queued.length === 0 && parked.length === 0) return Promise.resolve()
  const queuedIds = new Set(queued.map((i) => i.id))
  const parkedIds = new Set(parked.map((r) => r.id))
  return commit(
    owner,
    (s) => ({
      ...s,
      queue: s.queue.filter((i) => !queuedIds.has(i.id)),
      needsReview: s.needsReview.filter((r) => !parkedIds.has(r.id)),
    }),
    (s) => ({
      ...s,
      queue: [...s.queue, ...queued].sort((a, b) => a.seq - b.seq),
      needsReview: [...s.needsReview, ...parked],
    }),
    [
      ...queued.map((i) => queueDelete(i.id)),
      ...parked.map((r) => ({
        store: 'needsReview' as const,
        id: r.id,
        value: undefined,
      })),
    ],
  )
}

export type QueuedEntryChanges = {
  description: string
  projectId: string
  taskId: string | null
  tagIds: string[]
  billable: boolean
  startedAt: string
  endedAt: string | null
  durationSeconds?: number
  notes?: string
}

/**
 * Edits an entry that has not synced yet by rewriting the queued actions that
 * create and stop it (offline-mode REQ-7: queued entries stay editable).
 * Commits atomically; returns false when nothing queued refers to the entry.
 */
export function editQueuedEntry(
  workspaceId: string,
  memberId: string,
  entryId: string,
  changes: QueuedEntryChanges,
): Promise<boolean> {
  const owner = ownerKey(workspaceId, memberId)
  const before = getOwnerState(owner).queue.filter(
    (i) => itemEntryId(i) === entryId,
  )
  if (before.length === 0) return Promise.resolve(false)
  const fields = {
    description: changes.description,
    projectId: changes.projectId,
    taskId: changes.taskId,
    tagIds: changes.tagIds,
    billable: changes.billable,
  }
  const after = before.map((item): QueuedItem => {
    if (item.type === 'createManualEntry') {
      return {
        ...item,
        payload: {
          ...item.payload,
          ...fields,
          startedAt: changes.startedAt,
          endedAt: changes.endedAt ?? item.payload.endedAt,
          durationSeconds:
            changes.durationSeconds ?? item.payload.durationSeconds,
          notes: changes.notes ?? item.payload.notes,
        },
      }
    }
    if (item.type === 'startTimer') {
      return {
        ...item,
        payload: { ...item.payload, ...fields, startedAt: changes.startedAt },
      }
    }
    if (item.type === 'stopTimer') {
      return {
        ...item,
        payload: {
          ...item.payload,
          ...fields,
          endedAt: changes.endedAt ?? item.payload.endedAt,
        },
      }
    }
    return item
  })
  const replace = (list: QueuedItem[]) => (s: OwnerState) => ({
    ...s,
    queue: s.queue.map((i) => list.find((x) => x.id === i.id) ?? i),
  })
  return commit(
    owner,
    replace(after),
    replace(before),
    after.map(queueWrite),
  ).then(() => true)
}

// ── Needs-review (offline-mode REQ-3) ─────────────────────────────────────────

/** Moves a rejected item out of the queue into needs-review, atomically. */
export function parkQueuedItem(
  owner: string,
  itemId: string,
  message: string,
): Promise<void> {
  const item = getOwnerState(owner).queue.find((i) => i.id === itemId)
  if (!item) return Promise.resolve()
  const now = new Date().toISOString()
  const { inFlightSince: _inFlight, ...rest } = item
  const parked: NeedsReviewItem = {
    id: item.id,
    reason: 'rejected',
    message,
    attempts: (item.attempts ?? 0) + 1,
    firstFailedAt: now,
    lastFailedAt: now,
    item: { ...rest, attempts: (item.attempts ?? 0) + 1 },
  }
  return commit(
    owner,
    (s) => ({
      ...s,
      queue: s.queue.filter((i) => i.id !== itemId),
      needsReview: [...s.needsReview.filter((r) => r.id !== itemId), parked],
    }),
    (s) => ({
      ...s,
      queue: [...s.queue, item].sort((a, b) => a.seq - b.seq),
      needsReview: s.needsReview.filter((r) => r.id !== itemId),
    }),
    [
      queueDelete(itemId),
      { store: 'needsReview', id: parked.id, seq: item.seq, value: parked },
    ],
  )
}

/** Puts a parked item back at its original position in the queue. */
export function retryParkedItem(
  owner: string,
  reviewId: string,
): Promise<void> {
  const parked = getOwnerState(owner).needsReview.find((r) => r.id === reviewId)
  if (!parked?.item) return Promise.resolve()
  const item: QueuedItem = { ...parked.item, needsConfirmation: false }
  return commit(
    owner,
    (s) => ({
      ...s,
      needsReview: s.needsReview.filter((r) => r.id !== reviewId),
      queue: [...s.queue, item].sort((a, b) => a.seq - b.seq),
    }),
    (s) => ({
      ...s,
      queue: s.queue.filter((i) => i.id !== item.id),
      needsReview: [...s.needsReview, parked],
    }),
    [
      { store: 'needsReview', id: reviewId, value: undefined },
      queueWrite(item),
    ],
  )
}

/**
 * Permanently removes a parked item and every queued action that depends on
 * the same entry. Callers must confirm with the user first.
 */
export function discardParkedItem(
  owner: string,
  reviewId: string,
): Promise<{ entryId: string | null }> {
  const state = getOwnerState(owner)
  const parked = state.needsReview.find((r) => r.id === reviewId)
  if (!parked) return Promise.resolve({ entryId: null })
  const entryId = parked.item ? itemEntryId(parked.item) : null
  const dependents = entryId
    ? state.queue.filter((i) => itemEntryId(i) === entryId)
    : []
  const dependentIds = new Set(dependents.map((i) => i.id))
  return commit(
    owner,
    (s) => ({
      ...s,
      needsReview: s.needsReview.filter((r) => r.id !== reviewId),
      queue: s.queue.filter((i) => !dependentIds.has(i.id)),
    }),
    (s) => ({
      ...s,
      needsReview: [...s.needsReview, parked],
      queue: [...s.queue, ...dependents].sort((a, b) => a.seq - b.seq),
    }),
    [
      // A corrupt record may still sit in the queue store under the same id.
      { store: 'needsReview', id: reviewId, value: undefined },
      queueDelete(reviewId),
      ...dependents.map((i) => queueDelete(i.id)),
    ],
  ).then(() => ({ entryId }))
}

/** Entry ids whose creating action is parked: their dependents must wait. */
export function blockedEntryIds(owner: string): Set<string> {
  const ids = new Set<string>()
  for (const review of getOwnerState(owner).needsReview) {
    if (!review.item) continue
    if (
      review.item.type === 'startTimer' ||
      review.item.type === 'createManualEntry'
    ) {
      ids.add(review.item.optimisticId)
    }
  }
  return ids
}
