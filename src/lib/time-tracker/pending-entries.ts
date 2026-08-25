import type { TimeEntry } from './types'

const storageKey = (workspaceId: string, memberId: string) =>
  `pending-stopped-entries:${workspaceId}:${memberId}`

export type PendingEntriesReconciliation = {
  retained: TimeEntry[]
  confirmed: TimeEntry[]
  orphaned: TimeEntry[]
}

/**
 * Reconciles browser-only display copies against authoritative server rows and
 * the durable offline queue. Only entries still referenced by the queue need
 * to remain visible locally; server-backed copies are redundant and entries
 * with neither source are stale orphans from an interrupted older client.
 */
export function reconcilePendingEntries(
  pendingEntries: TimeEntry[],
  serverEntries: TimeEntry[],
  queuedEntryIds: ReadonlySet<string>,
): PendingEntriesReconciliation {
  const serverEntryIds = new Set(serverEntries.map((entry) => entry.id))
  const retained: TimeEntry[] = []
  const confirmed: TimeEntry[] = []
  const orphaned: TimeEntry[] = []

  for (const entry of pendingEntries) {
    if (queuedEntryIds.has(entry.id)) {
      retained.push(entry)
    } else if (serverEntryIds.has(entry.id)) {
      confirmed.push(entry)
    } else {
      orphaned.push(entry)
    }
  }

  return { retained, confirmed, orphaned }
}

function storePendingEntries(
  workspaceId: string,
  memberId: string,
  entries: TimeEntry[],
): void {
  if (entries.length === 0) {
    localStorage.removeItem(storageKey(workspaceId, memberId))
    return
  }
  localStorage.setItem(
    storageKey(workspaceId, memberId),
    JSON.stringify(entries),
  )
}

export function replacePendingEntries(
  workspaceId: string,
  memberId: string,
  entries: TimeEntry[],
): void {
  if (typeof window === 'undefined') return
  try {
    storePendingEntries(workspaceId, memberId, entries)
  } catch {
    // ignore storage errors
  }
}

export function savePendingEntry(
  workspaceId: string,
  memberId: string,
  entry: TimeEntry,
): void {
  if (typeof window === 'undefined') return
  try {
    const existing = loadPendingEntries(workspaceId, memberId)
    const next = [...existing.filter((e) => e.id !== entry.id), entry]
    storePendingEntries(workspaceId, memberId, next)
  } catch {
    // ignore storage errors
  }
}

export function removePendingEntry(
  workspaceId: string,
  memberId: string,
  entryId: string,
): void {
  if (typeof window === 'undefined') return
  try {
    const existing = loadPendingEntries(workspaceId, memberId)
    const next = existing.filter((e) => e.id !== entryId)
    storePendingEntries(workspaceId, memberId, next)
  } catch {
    // ignore storage errors
  }
}

export function loadPendingEntries(
  workspaceId: string,
  memberId: string,
): TimeEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(storageKey(workspaceId, memberId))
    if (!raw) return []
    return (JSON.parse(raw) as TimeEntry[]).filter(
      (entry) => entry.workspaceMemberId === memberId,
    )
  } catch {
    return []
  }
}
