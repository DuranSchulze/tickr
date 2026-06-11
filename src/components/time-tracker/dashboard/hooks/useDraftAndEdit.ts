import { useMemo, useState } from 'react'
import { gooeyToast } from '#/lib/toast'
import { dateTimeLocalValue } from '#/lib/time-tracker/store'
import { enqueueOfflineMutation } from '#/lib/time-tracker/offline-queue'
import type { TimeEntry, TrackerState } from '#/lib/time-tracker/types'
import { calculateManualSeconds, emptyDraft, toEntryPayload } from '../utils'
import type { DraftEntry } from '../utils'
import type { useTrackerMutations } from './useTrackerMutations'

export function useDraftAndEdit({
  state,
  mutations,
  lookupEntries,
  onMutated,
  isOnline = true,
  onOfflineCreate,
}: {
  state: TrackerState
  mutations: ReturnType<typeof useTrackerMutations>
  // Entries to resolve edits against. In the "all" view this includes entries
  // older than the dashboard's 90-day window, which are absent from
  // state.entries — without them, inline/drawer edits would silently no-op.
  lookupEntries?: TimeEntry[]
  // Called after a successful create/update so views backed by their own
  // local list (the paginated "all" view) can refresh.
  onMutated?: () => void
  isOnline?: boolean
  // Shows an offline-queued manual entry in the dashboard immediately
  // (it lands in the pending-entries store until the reconnect drain syncs it).
  onOfflineCreate?: (entry: TimeEntry) => void
}) {
  // Fall back to state.entries when no explicit lookup list is provided.
  const entries = lookupEntries ?? state.entries
  const activeClients = state.clients.filter((c) => c.clientStatus === 'ACTIVE')
  const initialClientId = activeClients[0]?.id || ''
  const initialProject =
    state.projects.find((p) => p.clientId === initialClientId) ?? null

  const [draft, setDraft] = useState<DraftEntry>(() =>
    emptyDraft(
      initialClientId,
      initialProject?.id || '',
      state.tags[0]?.id || '',
    ),
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [mobileTimerOpen, setMobileTimerOpen] = useState(false)
  const [editingDraft, setEditingDraft] = useState<DraftEntry>(() =>
    emptyDraft(
      initialClientId,
      initialProject?.id || '',
      state.tags[0]?.id || '',
    ),
  )

  // Derive editing validity — auto-cancels when entry is no longer in state
  const resolvedEditingId: string | null = editingId
    ? entries.some((e) => e.id === editingId)
      ? editingId
      : null
    : null

  const editingEntry = useMemo(
    () =>
      resolvedEditingId
        ? (entries.find((e) => e.id === resolvedEditingId) ?? null)
        : null,
    [resolvedEditingId, entries],
  )

  function resetDraft() {
    setDraft(
      emptyDraft(
        initialClientId,
        initialProject?.id || '',
        state.tags[0]?.id || '',
      ),
    )
  }

  function addManualEntry() {
    if (
      !draft.description.trim() ||
      !draft.clientId ||
      !draft.projectId ||
      calculateManualSeconds(draft) <= 0
    )
      return

    const payload = toEntryPayload(draft)

    if (!isOnline) {
      const optimisticId = `optimistic-manual-${crypto.randomUUID()}`
      enqueueOfflineMutation(state.workspace.id, {
        type: 'createManualEntry',
        optimisticId,
        payload,
      })
      onOfflineCreate?.({
        id: optimisticId,
        workspaceMemberId: state.currentMemberId,
        description: payload.description,
        projectId: payload.projectId,
        tagIds: payload.tagIds,
        billable: payload.billable,
        startedAt: payload.startedAt,
        endedAt: payload.endedAt,
        durationSeconds: payload.durationSeconds,
        notes: payload.notes,
      })
      gooeyToast.success('Entry saved offline', {
        description: 'It will sync when you reconnect.',
      })
      resetDraft()
      return
    }

    void mutations.addManualEntry(payload, {
      onSuccess: () => {
        resetDraft()
        onMutated?.()
      },
    })
  }

  function startEdit(entry: TimeEntry) {
    setEditingId(entry.id)
    const entryProject = state.projects.find((p) => p.id === entry.projectId)
    setEditingDraft({
      description: entry.description,
      clientId: entryProject?.clientId ?? '',
      projectId: entry.projectId,
      tagIds: entry.tagIds,
      billable: entry.billable,
      startedAt: dateTimeLocalValue(new Date(entry.startedAt)),
      endedAt: dateTimeLocalValue(new Date(entry.endedAt || Date.now())),
      notes: entry.notes,
    })
  }

  function saveEdit() {
    if (!editingId || !editingDraft.description.trim()) return

    // Running entry — update without touching endedAt to keep the timer alive
    if (!editingEntry?.endedAt) {
      const startedAt = new Date(editingDraft.startedAt)
      if (isNaN(startedAt.getTime()) || startedAt >= new Date()) return
      void mutations.updateActiveTimer(
        {
          id: editingId,
          description: editingDraft.description.trim(),
          projectId: editingDraft.projectId,
          tagIds: editingDraft.tagIds.filter(Boolean),
          billable: editingDraft.billable,
          startedAt: startedAt.toISOString(),
        },
        {
          onSuccess: () => {
            setEditingId(null)
            onMutated?.()
          },
        },
      )
      return
    }

    const origStart = dateTimeLocalValue(new Date(editingEntry.startedAt))
    const origEnd = dateTimeLocalValue(new Date(editingEntry.endedAt))
    const timesUnchanged =
      editingDraft.startedAt === origStart && editingDraft.endedAt === origEnd
    const durationSeconds = timesUnchanged
      ? editingEntry.durationSeconds
      : calculateManualSeconds(editingDraft)

    void mutations.updateEntry(
      editingId,
      { ...toEntryPayload(editingDraft), durationSeconds },
      {
        onSuccess: () => {
          setEditingId(null)
          onMutated?.()
        },
      },
    )
  }

  function handleInlineUpdate(
    entryId: string,
    patch: Partial<
      Pick<
        TimeEntry,
        | 'description'
        | 'billable'
        | 'projectId'
        | 'tagIds'
        | 'startedAt'
        | 'endedAt'
      >
    >,
  ) {
    const entry = entries.find((e) => e.id === entryId)
    if (!entry) return

    // Running entry — route through updateActiveTimer so endedAt is never set
    if (!entry.endedAt) {
      void mutations.updateActiveTimer(
        {
          id: entryId,
          description: (patch.description ?? entry.description).trim(),
          projectId: patch.projectId ?? entry.projectId,
          tagIds: patch.tagIds ?? entry.tagIds,
          billable: patch.billable ?? entry.billable,
          ...(patch.startedAt ? { startedAt: patch.startedAt } : {}),
        },
        { onSuccess: onMutated },
      )
      return
    }

    const description = (patch.description ?? entry.description).trim()
    if (!description) return
    const startedAt = patch.startedAt ?? entry.startedAt
    const endedAt = patch.endedAt ?? entry.endedAt
    const durationSeconds = Math.max(
      0,
      Math.floor(
        (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000,
      ),
    )
    void mutations.updateEntry(
      entryId,
      {
        description,
        projectId: patch.projectId ?? entry.projectId,
        tagIds: patch.tagIds ?? entry.tagIds,
        billable: patch.billable ?? entry.billable,
        startedAt,
        endedAt,
        durationSeconds,
        notes: entry.notes,
      },
      { onSuccess: onMutated },
    )
  }

  return {
    draft,
    setDraft,
    editingId,
    setEditingId,
    mobileTimerOpen,
    setMobileTimerOpen,
    editingDraft,
    setEditingDraft,
    editingEntry,
    addManualEntry,
    startEdit,
    saveEdit,
    handleInlineUpdate,
  }
}
