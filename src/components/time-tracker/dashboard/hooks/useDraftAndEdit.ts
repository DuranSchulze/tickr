import { useMemo, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { gooeyToast } from '#/lib/toast'
import { dateTimeLocalValue } from '#/lib/time-tracker/store'
import { enqueueOfflineMutation } from '#/lib/time-tracker/offline-queue'
import { upsertTrackerStateEntry } from '#/lib/time-tracker/query-keys'
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
  const router = useRouter()
  const queryClient = useQueryClient()

  // Fall back to state.entries when no explicit lookup list is provided.
  const entries = lookupEntries ?? state.entries

  // Reflect an edit in the cached tracker state immediately so the row updates
  // in the frontend without waiting for the (heavy) getTrackerState refetch.
  // The loader re-runs against the now-fresh cache, so no network round trip.
  function patchEntryOptimistically(updated: TimeEntry) {
    upsertTrackerStateEntry(queryClient, updated)
    void router.invalidate()
  }
  const [draft, setDraft] = useState<DraftEntry>(() => emptyDraft())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [mobileTimerOpen, setMobileTimerOpen] = useState(false)
  const [editingDraft, setEditingDraft] = useState<DraftEntry>(() =>
    emptyDraft(),
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
    setDraft(emptyDraft())
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
      enqueueOfflineMutation(state.workspace.id, state.currentMemberId, {
        type: 'createManualEntry',
        optimisticId,
        payload,
      })
      onOfflineCreate?.({
        id: optimisticId,
        workspaceMemberId: state.currentMemberId,
        description: payload.description,
        projectId: payload.projectId,
        taskId: payload.taskId,
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
      taskId: entry.taskId ?? '',
      tagIds: entry.tagIds,
      billable: entry.billable,
      startedAt: dateTimeLocalValue(new Date(entry.startedAt)),
      endedAt: dateTimeLocalValue(new Date(entry.endedAt || Date.now())),
      notes: entry.notes,
    })
  }

  function saveEdit() {
    if (!editingId || !editingDraft.description.trim() || !editingEntry) return
    const prev = editingEntry

    // Running entry — update without touching endedAt to keep the timer alive
    if (!prev.endedAt) {
      const startedAt = new Date(editingDraft.startedAt)
      if (isNaN(startedAt.getTime()) || startedAt >= new Date()) return
      const tagIds = editingDraft.tagIds.filter(Boolean)
      patchEntryOptimistically({
        ...prev,
        description: editingDraft.description.trim(),
        projectId: editingDraft.projectId,
        taskId: editingDraft.taskId || null,
        tagIds,
        billable: editingDraft.billable,
        startedAt: startedAt.toISOString(),
      })
      setEditingId(null)
      void mutations.updateActiveTimer(
        {
          id: editingId,
          description: editingDraft.description.trim(),
          projectId: editingDraft.projectId,
          taskId: editingDraft.taskId || null,
          tagIds,
          billable: editingDraft.billable,
          startedAt: startedAt.toISOString(),
        },
        {
          invalidate: false,
          onSuccess: () => onMutated?.(),
          onError: () => patchEntryOptimistically(prev),
        },
      )
      return
    }

    const origStart = dateTimeLocalValue(new Date(prev.startedAt))
    const origEnd = dateTimeLocalValue(new Date(prev.endedAt))
    const timesUnchanged =
      editingDraft.startedAt === origStart && editingDraft.endedAt === origEnd
    const durationSeconds = timesUnchanged
      ? prev.durationSeconds
      : calculateManualSeconds(editingDraft)

    const payload = { ...toEntryPayload(editingDraft), durationSeconds }
    patchEntryOptimistically({ ...prev, ...payload })
    setEditingId(null)
    void mutations.updateEntry(editingId, payload, {
      invalidate: false,
      onSuccess: () => onMutated?.(),
      onError: () => patchEntryOptimistically(prev),
    })
  }

  function handleInlineUpdate(
    entryId: string,
    patch: Partial<
      Pick<
        TimeEntry,
        | 'description'
        | 'billable'
        | 'projectId'
        | 'taskId'
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
      const description = (patch.description ?? entry.description).trim()
      const projectId = patch.projectId ?? entry.projectId
      const taskId = patch.taskId ?? entry.taskId
      const tagIds = patch.tagIds ?? entry.tagIds
      const billable = patch.billable ?? entry.billable
      const startedAt = patch.startedAt ?? entry.startedAt
      patchEntryOptimistically({
        ...entry,
        description,
        projectId,
        taskId,
        tagIds,
        billable,
        startedAt,
      })
      void mutations.updateActiveTimer(
        {
          id: entryId,
          description,
          projectId,
          taskId,
          tagIds,
          billable,
          ...(patch.startedAt ? { startedAt: patch.startedAt } : {}),
        },
        {
          invalidate: false,
          onSuccess: onMutated,
          onError: () => patchEntryOptimistically(entry),
        },
      )
      return
    }

    const description = (patch.description ?? entry.description).trim()
    if (!description) return
    const projectId = patch.projectId ?? entry.projectId
    const taskId = patch.taskId ?? entry.taskId
    const tagIds = patch.tagIds ?? entry.tagIds
    const billable = patch.billable ?? entry.billable
    const startedAt = patch.startedAt ?? entry.startedAt
    const endedAt = patch.endedAt ?? entry.endedAt
    const durationSeconds = Math.max(
      0,
      Math.floor(
        (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000,
      ),
    )
    patchEntryOptimistically({
      ...entry,
      description,
      projectId,
      taskId,
      tagIds,
      billable,
      startedAt,
      endedAt,
      durationSeconds,
    })
    void mutations.updateEntry(
      entryId,
      {
        description,
        projectId,
        taskId,
        tagIds,
        billable,
        startedAt,
        endedAt,
        durationSeconds,
        notes: entry.notes,
      },
      {
        invalidate: false,
        onSuccess: onMutated,
        onError: () => patchEntryOptimistically(entry),
      },
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
