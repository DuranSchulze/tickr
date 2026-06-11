type StartTimerPayload = {
  description: string
  projectId: string
  tagIds: string[]
  billable: boolean
  // Real client-side start time, so a replay after reconnect doesn't record
  // the reconnect moment as the start. Optional for items queued by older
  // app versions still sitting in localStorage.
  startedAt?: string
}

type StopTimerPayload = {
  id: string
  // Real client-side stop time (same reasoning as startedAt above).
  endedAt?: string
  // Final field values at the moment of stopping, mirroring the online
  // stop path's overrides.
  description?: string
  projectId?: string
  tagIds?: string[]
  billable?: boolean
}

type ManualEntryPayload = {
  description: string
  projectId: string
  tagIds: string[]
  billable: boolean
  startedAt: string
  endedAt: string
  durationSeconds: number
  notes: string
}

export type OfflineQueueItem =
  | {
      id: string
      type: 'startTimer'
      optimisticId: string
      payload: StartTimerPayload
    }
  | { id: string; type: 'stopTimer'; payload: StopTimerPayload }
  | { id: string; type: 'discardTimer'; payload: { id: string } }
  | {
      id: string
      type: 'createManualEntry'
      optimisticId: string
      payload: ManualEntryPayload
    }

export type EnqueueInput =
  | { type: 'startTimer'; optimisticId: string; payload: StartTimerPayload }
  | { type: 'stopTimer'; payload: StopTimerPayload }
  | { type: 'discardTimer'; payload: { id: string } }
  | {
      type: 'createManualEntry'
      optimisticId: string
      payload: ManualEntryPayload
    }

const storageKey = (workspaceId: string) => `offline-queue:${workspaceId}`

function load(workspaceId: string): OfflineQueueItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(storageKey(workspaceId))
    if (!raw) return []
    return JSON.parse(raw) as OfflineQueueItem[]
  } catch {
    return []
  }
}

function save(workspaceId: string, items: OfflineQueueItem[]): void {
  if (typeof window === 'undefined') return
  try {
    if (items.length === 0) {
      localStorage.removeItem(storageKey(workspaceId))
    } else {
      localStorage.setItem(storageKey(workspaceId), JSON.stringify(items))
    }
  } catch {
    // ignore storage errors
  }
}

export function enqueueOfflineMutation(
  workspaceId: string,
  item: EnqueueInput,
): OfflineQueueItem {
  const queued = { ...item, id: crypto.randomUUID() } as OfflineQueueItem
  const existing = load(workspaceId)
  save(workspaceId, [...existing, queued])
  return queued
}

export function loadOfflineQueue(workspaceId: string): OfflineQueueItem[] {
  return load(workspaceId)
}

export function removeOfflineQueueItem(
  workspaceId: string,
  itemId: string,
): void {
  const existing = load(workspaceId)
  save(
    workspaceId,
    existing.filter((i) => i.id !== itemId),
  )
}

/** True when a startTimer for this optimistic entry is still waiting to sync. */
export function hasQueuedStart(
  workspaceId: string,
  optimisticId: string,
): boolean {
  return load(workspaceId).some(
    (i) => i.type === 'startTimer' && i.optimisticId === optimisticId,
  )
}

/**
 * Drops every queued action tied to the given entry id (queued start plus any
 * stop/discard referencing it). Used when an offline-started timer is
 * discarded before it ever reached the server — nothing should be replayed.
 */
export function removeQueuedItemsForEntry(
  workspaceId: string,
  entryId: string,
): void {
  const existing = load(workspaceId)
  save(
    workspaceId,
    existing.filter((i) => {
      if (
        (i.type === 'startTimer' || i.type === 'createManualEntry') &&
        i.optimisticId === entryId
      ) {
        return false
      }
      if (
        (i.type === 'stopTimer' || i.type === 'discardTimer') &&
        i.payload.id === entryId
      ) {
        return false
      }
      return true
    }),
  )
}

export function clearOfflineQueue(workspaceId: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(storageKey(workspaceId))
  } catch {
    // ignore storage errors
  }
}
