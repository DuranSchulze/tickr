import { useMemo, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { notifyTracker } from '#/lib/time-tracker/notifications'
import { dateTimeLocalValue } from '#/lib/time-tracker/store'
import {
  editQueuedEntry,
  enqueueOfflineMutation,
  setOfflineEntryDeviceLocation,
} from '#/lib/time-tracker/offline-queue'
import { toast } from '#/lib/toast'
import { captureDeviceLocation } from '#/lib/time-tracker/device-location'
import { reportOfflineSaveFailure } from '#/lib/time-tracker/offline-alerts'
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
  onEntryPatched,
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
  // Keeps locally-held entry lists in sync with optimistic updates/rollbacks.
  onEntryPatched?: (entry: TimeEntry) => void
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
    onEntryPatched?.(updated)
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
      const workspaceId = state.workspace.id
      const memberId = state.currentMemberId
      const captureLocation = state.workspace.locationTrackingEnabled
      // Save durably first; only a committed entry is shown as saved and
      // clears the form (offline-mode REQ-1).
      const saveOffline = async () => {
        const optimisticId = `optimistic-manual-${crypto.randomUUID()}`
        const queued = await enqueueOfflineMutation(workspaceId, memberId, {
          type: 'createManualEntry',
          optimisticId,
          payload,
        })
        if (captureLocation) {
          void captureDeviceLocation().then((deviceLocation) => {
            if (!deviceLocation) return
            void setOfflineEntryDeviceLocation(
              workspaceId,
              memberId,
              queued.id,
              deviceLocation,
            ).catch(() => undefined)
          })
        }
        onOfflineCreate?.({
          id: optimisticId,
          workspaceMemberId: memberId,
          description: payload.description,
          projectId: payload.projectId,
          taskId: payload.taskId,
          tagIds: payload.tagIds,
          billable: payload.billable,
          startedAt: payload.startedAt,
          endedAt: payload.endedAt,
          durationSeconds: payload.durationSeconds,
          notes: payload.notes,
          entrySource: 'MANUAL',
        })
        notifyTracker({
          action: 'created',
          task: payload.description,
          durationSeconds: payload.durationSeconds,
          offline: true,
        })
        resetDraft()
      }
      const attempt = (): Promise<void> =>
        saveOffline().catch((error: unknown) => {
          reportOfflineSaveFailure({
            title: 'Entry not saved',
            error,
            retry: attempt,
          })
        })
      void attempt()
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

  /**
   * Offline edits (offline-mode REQ-7): entries already on the server are
   * read-only until reconnecting; entries still in the offline queue are
   * edited in place so the corrected values are what syncs.
   */
  function applyOfflineEdit(original: TimeEntry, next: TimeEntry) {
    if (!original.id.startsWith('optimistic-')) {
      toast.error('Connect to edit synced entries', {
        description:
          'This entry is already saved on the server, so it can only be changed online. Nothing was changed.',
      })
      return
    }
    void editQueuedEntry(
      state.workspace.id,
      state.currentMemberId,
      original.id,
      {
        description: next.description,
        projectId: next.projectId,
        taskId: next.taskId,
        tagIds: next.tagIds,
        billable: next.billable,
        startedAt: next.startedAt,
        endedAt: next.endedAt,
        durationSeconds: next.durationSeconds,
        notes: next.notes,
      },
    )
      .then((edited) => {
        if (!edited) {
          toast.error('Connect to edit this entry', {
            description: 'It has already synced. Nothing was changed.',
          })
          return
        }
        setEditingId(null)
        if (next.endedAt) onOfflineCreate?.(next)
        else patchEntryOptimistically(next)
      })
      .catch((error: unknown) => {
        reportOfflineSaveFailure({
          title: 'Edit not saved',
          error,
          retry: async () => applyOfflineEdit(original, next),
        })
      })
  }

  function saveEdit() {
    if (!editingId || !editingDraft.description.trim() || !editingEntry) return
    const prev = editingEntry

    if (!isOnline) {
      const startedAt = new Date(editingDraft.startedAt)
      if (isNaN(startedAt.getTime())) return
      const fields = toEntryPayload(editingDraft)
      applyOfflineEdit(
        prev,
        prev.endedAt
          ? {
              ...prev,
              ...fields,
              durationSeconds: calculateManualSeconds(editingDraft),
            }
          : {
              ...prev,
              description: editingDraft.description.trim(),
              projectId: editingDraft.projectId,
              taskId: editingDraft.taskId || null,
              tagIds: editingDraft.tagIds.filter(Boolean),
              billable: editingDraft.billable,
              startedAt: startedAt.toISOString(),
            },
      )
      return
    }

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

    if (!isOnline) {
      const next = { ...entry, ...patch }
      next.description = next.description.trim()
      if (!next.description) return
      if (next.endedAt) {
        next.durationSeconds = Math.max(
          0,
          Math.floor(
            (Date.parse(next.endedAt) - Date.parse(next.startedAt)) / 1000,
          ),
        )
      }
      applyOfflineEdit(entry, next)
      return
    }

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
