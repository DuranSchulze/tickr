import type { TimeEntry } from './types'

const storageKey = (workspaceId: string, memberId: string) =>
  `pending-stopped-entries:${workspaceId}:${memberId}`

export function savePendingEntry(
  workspaceId: string,
  memberId: string,
  entry: TimeEntry,
): void {
  if (typeof window === 'undefined') return
  try {
    const existing = loadPendingEntries(workspaceId, memberId)
    const next = [...existing.filter((e) => e.id !== entry.id), entry]
    localStorage.setItem(
      storageKey(workspaceId, memberId),
      JSON.stringify(next),
    )
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
    if (next.length === 0) {
      localStorage.removeItem(storageKey(workspaceId, memberId))
    } else {
      localStorage.setItem(
        storageKey(workspaceId, memberId),
        JSON.stringify(next),
      )
    }
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
