import type { TimeEntry } from './types'
import {
  commit,
  getOwnerState,
  mutateMirror,
  nextSeq,
  ownerKey,
} from './offline-store'
import type { OwnerState } from './offline-store'

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

// Display copies live in the encrypted `pendingDisplay` store (offline-mode
// REQ-1). They are a UI aid: the queue is the source of truth, so a failed
// write here is logged rather than shown as a blocking error.
function persist(promise: Promise<void>) {
  void promise.catch((err: unknown) =>
    console.warn('Could not save the local entry copy', err),
  )
}

const displayWrite = (entry: TimeEntry) => ({
  store: 'pendingDisplay' as const,
  id: entry.id,
  seq: nextSeq(),
  value: entry,
})
const displayDelete = (id: string) => ({
  store: 'pendingDisplay' as const,
  id,
  value: undefined,
})

export function replacePendingEntries(
  workspaceId: string,
  memberId: string,
  entries: TimeEntry[],
): void {
  const owner = ownerKey(workspaceId, memberId)
  const before = getOwnerState(owner).pendingDisplay
  if (!getOwnerState(owner).available) {
    mutateMirror(owner, (s) => ({ ...s, pendingDisplay: entries }))
    return
  }
  const keep = new Set(entries.map((e) => e.id))
  persist(
    commit(
      owner,
      (s) => ({ ...s, pendingDisplay: entries }),
      (s) => ({ ...s, pendingDisplay: before }),
      [
        ...before
          .filter((e) => !keep.has(e.id))
          .map((e) => displayDelete(e.id)),
        ...entries.map(displayWrite),
      ],
    ),
  )
}

export function savePendingEntry(
  workspaceId: string,
  memberId: string,
  entry: TimeEntry,
): void {
  const owner = ownerKey(workspaceId, memberId)
  const state = getOwnerState(owner)
  const previous = state.pendingDisplay.find((e) => e.id === entry.id)
  const upsert = (s: OwnerState) => ({
    ...s,
    pendingDisplay: [
      ...s.pendingDisplay.filter((e) => e.id !== entry.id),
      entry,
    ],
  })
  if (!state.available) {
    mutateMirror(owner, upsert)
    return
  }
  persist(
    commit(
      owner,
      upsert,
      (s) => ({
        ...s,
        pendingDisplay: [
          ...s.pendingDisplay.filter((e) => e.id !== entry.id),
          ...(previous ? [previous] : []),
        ],
      }),
      [displayWrite(entry)],
    ),
  )
}

export function removePendingEntry(
  workspaceId: string,
  memberId: string,
  entryId: string,
): void {
  const owner = ownerKey(workspaceId, memberId)
  const state = getOwnerState(owner)
  const previous = state.pendingDisplay.find((e) => e.id === entryId)
  if (!previous) return
  if (!state.available) {
    mutateMirror(owner, (s) => ({
      ...s,
      pendingDisplay: s.pendingDisplay.filter((e) => e.id !== entryId),
    }))
    return
  }
  persist(
    commit(
      owner,
      (s) => ({
        ...s,
        pendingDisplay: s.pendingDisplay.filter((e) => e.id !== entryId),
      }),
      (s) => ({ ...s, pendingDisplay: [...s.pendingDisplay, previous] }),
      [displayDelete(entryId)],
    ),
  )
}

export function loadPendingEntries(
  workspaceId: string,
  memberId: string,
): TimeEntry[] {
  return getOwnerState(ownerKey(workspaceId, memberId)).pendingDisplay.filter(
    (entry) => entry.workspaceMemberId === memberId,
  )
}
