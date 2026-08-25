import type { DeviceLocation } from './device-location'

type StartTimerPayload = {
  description: string
  projectId: string
  taskId: string | null
  tagIds: string[]
  billable: boolean
  // Real client-side start time, so a replay after reconnect doesn't record
  // the reconnect moment as the start. Optional for items queued by older
  // app versions still sitting in localStorage.
  startedAt?: string
  deviceLocation?: DeviceLocation
}

type StopTimerPayload = {
  id: string
  // Real client-side stop time (same reasoning as startedAt above).
  endedAt?: string
  // Final field values at the moment of stopping, mirroring the online
  // stop path's overrides.
  description?: string
  projectId?: string
  taskId?: string | null
  tagIds?: string[]
  billable?: boolean
}

type ManualEntryPayload = {
  description: string
  projectId: string
  taskId: string | null
  tagIds: string[]
  billable: boolean
  startedAt: string
  endedAt: string
  durationSeconds: number
  notes: string
  deviceLocation?: DeviceLocation
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

const storageKey = (workspaceId: string, memberId: string) =>
  `offline-queue:${workspaceId}:${memberId}`

function load(workspaceId: string, memberId: string): OfflineQueueItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(storageKey(workspaceId, memberId))
    if (!raw) return []
    return JSON.parse(raw) as OfflineQueueItem[]
  } catch {
    return []
  }
}

function save(
  workspaceId: string,
  memberId: string,
  items: OfflineQueueItem[],
): void {
  if (typeof window === 'undefined') return
  try {
    if (items.length === 0) {
      localStorage.removeItem(storageKey(workspaceId, memberId))
    } else {
      localStorage.setItem(
        storageKey(workspaceId, memberId),
        JSON.stringify(items),
      )
    }
  } catch {
    // ignore storage errors
  }
}

export function enqueueOfflineMutation(
  workspaceId: string,
  memberId: string,
  item: EnqueueInput,
): OfflineQueueItem {
  const queued = { ...item, id: crypto.randomUUID() } as OfflineQueueItem
  const existing = load(workspaceId, memberId)
  save(workspaceId, memberId, [...existing, queued])
  return queued
}

export function loadOfflineQueue(
  workspaceId: string,
  memberId: string,
): OfflineQueueItem[] {
  return load(workspaceId, memberId)
}

/** Entry ids whose local display copies must be retained until replay ends. */
export function getQueuedEntryIds(
  workspaceId: string,
  memberId: string,
): Set<string> {
  const entryIds = new Set<string>()
  for (const item of load(workspaceId, memberId)) {
    if (item.type === 'startTimer' || item.type === 'createManualEntry') {
      entryIds.add(item.optimisticId)
    } else {
      entryIds.add(item.payload.id)
    }
  }
  return entryIds
}

export function removeOfflineQueueItem(
  workspaceId: string,
  memberId: string,
  itemId: string,
): void {
  const existing = load(workspaceId, memberId)
  save(
    workspaceId,
    memberId,
    existing.filter((i) => i.id !== itemId),
  )
}

export function setOfflineEntryDeviceLocation(
  workspaceId: string,
  memberId: string,
  itemId: string,
  deviceLocation: DeviceLocation,
): void {
  const existing = load(workspaceId, memberId)
  save(
    workspaceId,
    memberId,
    existing.map((item): OfflineQueueItem => {
      if (item.id !== itemId) return item
      if (item.type === 'startTimer') {
        return { ...item, payload: { ...item.payload, deviceLocation } }
      }
      if (item.type === 'createManualEntry') {
        return { ...item, payload: { ...item.payload, deviceLocation } }
      }
      return item
    }),
  )
}

/** True when a startTimer for this optimistic entry is still waiting to sync. */
export function hasQueuedStart(
  workspaceId: string,
  memberId: string,
  optimisticId: string,
): boolean {
  return load(workspaceId, memberId).some(
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
  memberId: string,
  entryId: string,
): void {
  const existing = load(workspaceId, memberId)
  save(
    workspaceId,
    memberId,
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

export function clearOfflineQueue(workspaceId: string, memberId: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(storageKey(workspaceId, memberId))
  } catch {
    // ignore storage errors
  }
}
