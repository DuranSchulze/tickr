import type { TimeEntry } from './types'

const storageKey = (workspaceId: string) =>
  `pending-stopped-entries:${workspaceId}`

export function savePendingEntry(workspaceId: string, entry: TimeEntry): void {
  if (typeof window === 'undefined') return
  try {
    const existing = loadPendingEntries(workspaceId)
    const next = [...existing.filter((e) => e.id !== entry.id), entry]
    localStorage.setItem(storageKey(workspaceId), JSON.stringify(next))
  } catch {
    // ignore storage errors
  }
}

export function removePendingEntry(workspaceId: string, entryId: string): void {
  if (typeof window === 'undefined') return
  try {
    const existing = loadPendingEntries(workspaceId)
    const next = existing.filter((e) => e.id !== entryId)
    if (next.length === 0) {
      localStorage.removeItem(storageKey(workspaceId))
    } else {
      localStorage.setItem(storageKey(workspaceId), JSON.stringify(next))
    }
  } catch {
    // ignore storage errors
  }
}

export function loadPendingEntries(workspaceId: string): TimeEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(storageKey(workspaceId))
    if (!raw) return []
    return JSON.parse(raw) as TimeEntry[]
  } catch {
    return []
  }
}
