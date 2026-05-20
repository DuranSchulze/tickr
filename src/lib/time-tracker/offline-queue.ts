type StartTimerPayload = {
  description: string
  projectId: string
  tagIds: string[]
  billable: boolean
}

export type OfflineQueueItem =
  | {
      id: string
      type: 'startTimer'
      optimisticId: string
      payload: StartTimerPayload
    }
  | { id: string; type: 'stopTimer'; payload: { id: string } }
  | { id: string; type: 'discardTimer'; payload: { id: string } }

export type EnqueueInput =
  | { type: 'startTimer'; optimisticId: string; payload: StartTimerPayload }
  | { type: 'stopTimer'; payload: { id: string } }
  | { type: 'discardTimer'; payload: { id: string } }

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

export function clearOfflineQueue(workspaceId: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(storageKey(workspaceId))
  } catch {
    // ignore storage errors
  }
}
