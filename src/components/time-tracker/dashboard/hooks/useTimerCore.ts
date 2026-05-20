import { useEffect, useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from 'goey-toast'
import { formatDuration } from '#/lib/time-tracker/store'
import {
  loadPendingEntries,
  removePendingEntry,
  savePendingEntry,
} from '#/lib/time-tracker/pending-entries'
import { enqueueOfflineMutation } from '#/lib/time-tracker/offline-queue'
import type { TimeEntry, TrackerState } from '#/lib/time-tracker/types'
import { deleteEntryFn, stopTimerFn } from '#/lib/server/tracker'
import type { useTrackerMutations } from './useTrackerMutations'
import { useDescriptionSuggestions } from './useDescriptionSuggestions'

type TimerOperation =
  | { kind: 'idle' }
  | { kind: 'starting'; token: number; optimisticId: string }
  | { kind: 'runningOptimistic'; token: number; entryId: string }
  | { kind: 'stopping'; token: number; entryId: string }
  | { kind: 'discarding'; token: number; entryId: string }

export type { TimerOperation }

export function useTimerCore({
  state,
  mutations,
  isOnline,
}: {
  state: TrackerState
  mutations: ReturnType<typeof useTrackerMutations>
  isOnline: boolean
}) {
  const router = useRouter()

  // --- Operation state machine ---
  const [timerOperation, setTimerOperationState] = useState<TimerOperation>({
    kind: 'idle',
  })
  const timerOperationRef = useRef<TimerOperation>({ kind: 'idle' })
  const operationTokenRef = useRef(0)

  function setTimerOperation(next: TimerOperation) {
    timerOperationRef.current = next
    setTimerOperationState(next)
  }

  function nextOperationToken() {
    operationTokenRef.current += 1
    return operationTokenRef.current
  }

  function operationHasToken(operation: TimerOperation, token: number) {
    return operation.kind !== 'idle' && operation.token === token
  }

  // --- Optimistic entries ---
  const [optimisticActiveEntry, setOptimisticActiveEntry] =
    useState<TimeEntry | null>(null)
  const [optimisticStoppedEntries, setOptimisticStoppedEntries] = useState<
    TimeEntry[]
  >(() => loadPendingEntries(state.workspace.id))

  function upsertOptimisticStoppedEntry(entry: TimeEntry) {
    setOptimisticStoppedEntries((prev) => [
      ...prev.filter((e) => e.id !== entry.id),
      entry,
    ])
    savePendingEntry(state.workspace.id, entry)
  }

  function removeOptimisticStoppedEntry(entryId: string) {
    setOptimisticStoppedEntries((prev) => prev.filter((e) => e.id !== entryId))
    removePendingEntry(state.workspace.id, entryId)
  }

  function buildStoppedEntry(entryToStop: TimeEntry): TimeEntry {
    const now = new Date()
    const durationSeconds = Math.floor(
      (now.getTime() - new Date(entryToStop.startedAt).getTime()) / 1000,
    )
    return { ...entryToStop, endedAt: now.toISOString(), durationSeconds }
  }

  // --- Derived active-entry base ---
  const serverActiveEntry = state.entries.find(
    (e) => e.workspaceMemberId === state.currentMemberId && !e.endedAt,
  )
  const serverActiveIsLocallyHidden =
    !!serverActiveEntry &&
    (timerOperation.kind === 'stopping' ||
      timerOperation.kind === 'discarding') &&
    timerOperation.entryId === serverActiveEntry.id
  const activeEntryBase =
    optimisticActiveEntry ??
    (serverActiveIsLocallyHidden ? undefined : serverActiveEntry)

  // --- Timer input state ---
  const [timerDescription, setTimerDescription] = useState('')
  const [timerClientId, setTimerClientId] = useState('')
  const [timerProjectId, setTimerProjectId] = useState('')
  const [timerTagIds, setTimerTagIds] = useState<string[]>([])
  const [timerBillable, setTimerBillable] = useState(false)

  const lastSyncedEntryIdRef = useRef<string | null>(null)
  const timerInputDirtyRef = useRef(false)
  const isApplyingPresetRef = useRef(false)

  // Combine activeEntryBase with local input overrides to get final activeEntry.
  const activeEntry =
    activeEntryBase && lastSyncedEntryIdRef.current === activeEntryBase.id
      ? {
          ...activeEntryBase,
          description: timerDescription,
          projectId: timerProjectId,
          tagIds: timerTagIds.filter(Boolean),
          billable: timerBillable,
        }
      : activeEntryBase

  const stopBlocked =
    !!activeEntry &&
    (!timerDescription.trim() ||
      !timerClientId ||
      !timerProjectId ||
      timerTagIds.filter(Boolean).length === 0)

  // --- Description suggestions ---
  const { suggestions: descriptionSuggestions, lookupEntry } =
    useDescriptionSuggestions(
      state.entries,
      state.currentMemberId,
      timerDescription,
    )

  // --- Server sync effect ---
  useEffect(() => {
    const op = timerOperationRef.current
    if (
      (op.kind === 'stopping' || op.kind === 'discarding') &&
      serverActiveEntry?.id !== op.entryId
    ) {
      setTimerOperation({ kind: 'idle' })
    }

    if (!serverActiveEntry) return

    if (optimisticActiveEntry?.id === serverActiveEntry.id) {
      setOptimisticActiveEntry(null)
    }

    if (
      op.kind === 'runningOptimistic' &&
      op.entryId === serverActiveEntry.id
    ) {
      setTimerOperation({ kind: 'idle' })
    }
  }, [optimisticActiveEntry?.id, serverActiveEntry])

  // Drop pending entries that have been confirmed by the server.
  useEffect(() => {
    if (optimisticStoppedEntries.length === 0) return
    const confirmedIds = new Set(state.entries.map((e) => e.id))
    const toRemove = optimisticStoppedEntries.filter((e) =>
      confirmedIds.has(e.id),
    )
    if (toRemove.length === 0) return
    setOptimisticStoppedEntries((prev) =>
      prev.filter((e) => !confirmedIds.has(e.id)),
    )
    for (const entry of toRemove) {
      removePendingEntry(state.workspace.id, entry.id)
    }
  }, [state.entries, state.workspace.id, optimisticStoppedEntries.length])

  // Sync timer-input state from the active entry without overwriting local edits.
  useEffect(() => {
    if (isApplyingPresetRef.current) return
    if (activeEntryBase) {
      const isNewEntry = activeEntryBase.id !== lastSyncedEntryIdRef.current
      if (!isNewEntry && timerInputDirtyRef.current) return

      lastSyncedEntryIdRef.current = activeEntryBase.id
      timerInputDirtyRef.current = false
      const entryProject = state.projects.find(
        (p) => p.id === activeEntryBase.projectId,
      )
      setTimerDescription(activeEntryBase.description)
      setTimerClientId(entryProject?.clientId ?? '')
      setTimerProjectId(activeEntryBase.projectId)
      setTimerTagIds(activeEntryBase.tagIds)
      setTimerBillable(activeEntryBase.billable)
    } else if (lastSyncedEntryIdRef.current && timerOperation.kind === 'idle') {
      lastSyncedEntryIdRef.current = null
      timerInputDirtyRef.current = false
      setTimerDescription('')
      setTimerClientId('')
      setTimerProjectId('')
      setTimerTagIds([])
      setTimerBillable(false)
    }
  }, [activeEntryBase, state.projects, timerOperation.kind])

  // --- Debounced autosave ---
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    },
    [],
  )

  function persistActiveTimer(
    next: {
      description: string
      projectId: string
      tagIds: string[]
      billable: boolean
    },
    delay = 0,
  ) {
    if (!activeEntryBase) return
    if (activeEntryBase.id.startsWith('optimistic-')) return
    const op = timerOperationRef.current
    if (
      (op.kind === 'stopping' || op.kind === 'discarding') &&
      op.entryId === activeEntryBase.id
    ) {
      return
    }
    const id = activeEntryBase.id
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      void mutations.updateActiveTimer({ id, ...next }, { invalidate: false })
    }, delay)
  }

  function flushDescriptionSave() {
    if (!saveTimeoutRef.current) return
    clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = null
    if (!activeEntryBase || activeEntryBase.id.startsWith('optimistic-')) return
    const op = timerOperationRef.current
    if (op.kind === 'stopping' || op.kind === 'discarding') return
    void mutations.updateActiveTimer(
      {
        id: activeEntryBase.id,
        description: timerDescription.trim(),
        projectId: timerProjectId,
        tagIds: timerTagIds,
        billable: timerBillable,
      },
      { invalidate: false },
    )
  }

  // --- Timer input change handlers ---
  function changeTimerDescription(value: string) {
    timerInputDirtyRef.current = true
    setTimerDescription(value)
    if (activeEntry) {
      persistActiveTimer(
        {
          description: value.trim(),
          projectId: timerProjectId,
          tagIds: timerTagIds,
          billable: timerBillable,
        },
        500,
      )
    }
  }

  function applyDescriptionSuggestion(description: string) {
    const matchingEntry = lookupEntry(description)
    timerInputDirtyRef.current = true
    setTimerDescription(description)
    let nextProjectId = timerProjectId
    let nextTagIds = timerTagIds
    let nextBillable = timerBillable
    if (matchingEntry) {
      const matchingProject = state.projects.find(
        (p) => p.id === matchingEntry.projectId,
      )
      if (matchingProject) {
        nextProjectId = matchingProject.id
        setTimerClientId(matchingProject.clientId)
        setTimerProjectId(matchingProject.id)
      }
      nextTagIds = matchingEntry.tagIds
      nextBillable = matchingEntry.billable
      setTimerTagIds(matchingEntry.tagIds)
      setTimerBillable(matchingEntry.billable)
    }
    if (activeEntry) {
      persistActiveTimer({
        description: description.trim(),
        projectId: nextProjectId,
        tagIds: nextTagIds,
        billable: nextBillable,
      })
    }
  }

  function changeTimerClient(nextClientId: string) {
    timerInputDirtyRef.current = true
    setTimerClientId(nextClientId)
    const stillValid = state.projects.some(
      (p) => p.id === timerProjectId && p.clientId === nextClientId,
    )
    const nextProjectId = stillValid ? timerProjectId : ''
    if (!stillValid) setTimerProjectId('')
    if (activeEntry) {
      persistActiveTimer({
        description: timerDescription.trim(),
        projectId: nextProjectId,
        tagIds: timerTagIds,
        billable: timerBillable,
      })
    }
  }

  function changeTimerProject(nextProjectId: string) {
    timerInputDirtyRef.current = true
    setTimerProjectId(nextProjectId)
    if (activeEntry) {
      persistActiveTimer({
        description: timerDescription.trim(),
        projectId: nextProjectId,
        tagIds: timerTagIds,
        billable: timerBillable,
      })
    }
  }

  function changeTimerTagIds(nextTagIds: string[]) {
    timerInputDirtyRef.current = true
    setTimerTagIds(nextTagIds)
    if (activeEntry) {
      persistActiveTimer({
        description: timerDescription.trim(),
        projectId: timerProjectId,
        tagIds: nextTagIds,
        billable: timerBillable,
      })
    }
  }

  function changeTimerBillable(nextBillable: boolean) {
    timerInputDirtyRef.current = true
    setTimerBillable(nextBillable)
    if (activeEntry) {
      persistActiveTimer({
        description: timerDescription.trim(),
        projectId: timerProjectId,
        tagIds: timerTagIds,
        billable: nextBillable,
      })
    }
  }

  function applyPreset(preset: {
    clientId: string
    projectId: string
    tagIds: string[]
    billable: boolean
  }) {
    isApplyingPresetRef.current = true
    timerInputDirtyRef.current = true
    setTimerClientId(preset.clientId)
    setTimerProjectId(preset.projectId)
    setTimerTagIds(preset.tagIds)
    setTimerBillable(preset.billable)
    // Allow the sync-back effect to run again after this render cycle.
    Promise.resolve().then(() => {
      isApplyingPresetRef.current = false
    })
    if (activeEntry && !activeEntry.id.startsWith('optimistic-')) {
      persistActiveTimer({
        description: timerDescription.trim(),
        projectId: preset.projectId,
        tagIds: preset.tagIds.filter(Boolean),
        billable: preset.billable,
      })
    }
  }

  // --- Timer actions ---
  function performOptimisticStop(entryToStop: TimeEntry, token?: number) {
    const operationToken = token ?? nextOperationToken()
    const stoppedEntry = buildStoppedEntry(entryToStop)

    setOptimisticActiveEntry(null)
    setTimerOperation({
      kind: 'stopping',
      token: operationToken,
      entryId: entryToStop.id,
    })
    upsertOptimisticStoppedEntry(stoppedEntry)

    gooeyToast.success('Timer stopped', {
      description: `Duration: ${formatDuration(stoppedEntry.durationSeconds)}`,
    })

    if (!isOnline) {
      enqueueOfflineMutation(state.workspace.id, {
        type: 'stopTimer',
        payload: { id: entryToStop.id },
      })
      return
    }

    void stopTimerFn({ data: { id: entryToStop.id } })
      .then((confirmedEntry) => {
        const op = timerOperationRef.current
        if (
          op.kind !== 'stopping' ||
          op.token !== operationToken ||
          op.entryId !== entryToStop.id
        ) {
          return
        }

        if (confirmedEntry) {
          upsertOptimisticStoppedEntry(confirmedEntry)
        } else {
          removeOptimisticStoppedEntry(entryToStop.id)
        }
        setTimeout(() => void router.invalidate(), 800)
      })
      .catch((err: unknown) => {
        const op = timerOperationRef.current
        if (
          op.kind !== 'stopping' ||
          op.token !== operationToken ||
          op.entryId !== entryToStop.id
        ) {
          return
        }

        removeOptimisticStoppedEntry(entryToStop.id)
        setTimerOperation({ kind: 'idle' })
        setOptimisticActiveEntry(entryToStop)
        gooeyToast.error('Failed to stop timer', {
          description: err instanceof Error ? err.message : 'Please try again.',
        })
      })
  }

  function resumeEntry(entry: TimeEntry) {
    if (activeEntry) return
    const project = state.projects.find((p) => p.id === entry.projectId)
    const description = entry.description
    const projectId = entry.projectId
    const tagIds = entry.tagIds.filter(Boolean)
    const billable = entry.billable
    const startedAt = new Date().toISOString()

    setTimerDescription(description)
    setTimerClientId(project?.clientId ?? '')
    setTimerProjectId(projectId)
    setTimerTagIds(tagIds)
    setTimerBillable(billable)
    timerInputDirtyRef.current = false

    const token = nextOperationToken()
    const optimisticEntry: TimeEntry = {
      id: `optimistic-${startedAt}`,
      workspaceMemberId: state.currentMemberId,
      description,
      projectId,
      tagIds,
      billable,
      startedAt,
      endedAt: null,
      durationSeconds: 0,
      notes: '',
    }
    setOptimisticActiveEntry(optimisticEntry)
    setTimerOperation({
      kind: 'starting',
      token,
      optimisticId: optimisticEntry.id,
    })
    gooeyToast.success('Timer started', {
      description: description || 'No description',
    })

    const resumeInput = { description, projectId, tagIds, billable }

    if (!isOnline) {
      enqueueOfflineMutation(state.workspace.id, {
        type: 'startTimer',
        optimisticId: optimisticEntry.id,
        payload: resumeInput,
      })
      setTimerOperation({
        kind: 'runningOptimistic',
        token,
        entryId: optimisticEntry.id,
      })
      return
    }

    void mutations.startTimer(resumeInput, {
      onSuccess: (newEntry) => {
        const op = timerOperationRef.current
        if (!operationHasToken(op, token)) return

        if (op.kind === 'discarding') {
          setOptimisticActiveEntry(null)
          void deleteEntryFn({ data: { id: newEntry.id } }).finally(() => {
            if (operationHasToken(timerOperationRef.current, token)) {
              setTimerOperation({ kind: 'idle' })
            }
            void router.invalidate()
          })
          return
        }

        if (op.kind === 'stopping') {
          removeOptimisticStoppedEntry(op.entryId)
          performOptimisticStop(newEntry, token)
          return
        }

        setOptimisticActiveEntry(newEntry)
        setTimerOperation({
          kind: 'runningOptimistic',
          token,
          entryId: newEntry.id,
        })
      },
      onError: () => {
        if (!operationHasToken(timerOperationRef.current, token)) return
        setOptimisticActiveEntry(null)
        setTimerOperation({ kind: 'idle' })
        gooeyToast.error('Failed to start timer', {
          description: 'Please try again.',
        })
      },
    })
  }

  function discardTimer() {
    if (!activeEntryBase) return
    flushDescriptionSave()
    const entryToDiscard = activeEntryBase
    const currentOp = timerOperationRef.current

    if (entryToDiscard.id.startsWith('optimistic-')) {
      setOptimisticActiveEntry(null)
      setTimerOperation({
        kind: 'discarding',
        token:
          currentOp.kind === 'starting' || currentOp.kind === 'stopping'
            ? currentOp.token
            : nextOperationToken(),
        entryId: entryToDiscard.id,
      })
      gooeyToast.success('Timer discarded')
      return
    }

    const token = nextOperationToken()
    setOptimisticActiveEntry(null)
    setTimerOperation({
      kind: 'discarding',
      token,
      entryId: entryToDiscard.id,
    })

    gooeyToast.success('Timer discarded')

    if (!isOnline) {
      enqueueOfflineMutation(state.workspace.id, {
        type: 'discardTimer',
        payload: { id: entryToDiscard.id },
      })
      return
    }

    void deleteEntryFn({ data: { id: entryToDiscard.id } })
      .then(() => {
        const op = timerOperationRef.current
        if (
          op.kind !== 'discarding' ||
          op.token !== token ||
          op.entryId !== entryToDiscard.id
        ) {
          return
        }
        void router.invalidate()
      })
      .catch((err: unknown) => {
        const op = timerOperationRef.current
        if (
          op.kind !== 'discarding' ||
          op.token !== token ||
          op.entryId !== entryToDiscard.id
        ) {
          return
        }
        setTimerOperation({ kind: 'idle' })
        gooeyToast.error('Failed to discard timer', {
          description: err instanceof Error ? err.message : 'Please try again.',
        })
      })
  }

  function startTimer() {
    if (activeEntry) return
    const description = timerDescription.trim()
    const nextInput = {
      description,
      projectId: timerProjectId,
      tagIds: timerTagIds.filter(Boolean),
      billable: timerBillable,
    }
    const startedAt = new Date().toISOString()
    const token = nextOperationToken()

    const optimisticEntry: TimeEntry = {
      id: `optimistic-${startedAt}`,
      workspaceMemberId: state.currentMemberId,
      description,
      projectId: timerProjectId,
      tagIds: nextInput.tagIds,
      billable: timerBillable,
      startedAt,
      endedAt: null,
      durationSeconds: 0,
      notes: '',
    }
    setOptimisticActiveEntry(optimisticEntry)
    setTimerOperation({
      kind: 'starting',
      token,
      optimisticId: optimisticEntry.id,
    })
    lastSyncedEntryIdRef.current = optimisticEntry.id
    timerInputDirtyRef.current = false
    gooeyToast.success('Timer started', {
      description: description || 'No description',
    })

    if (!isOnline) {
      enqueueOfflineMutation(state.workspace.id, {
        type: 'startTimer',
        optimisticId: optimisticEntry.id,
        payload: nextInput,
      })
      setTimerOperation({
        kind: 'runningOptimistic',
        token,
        entryId: optimisticEntry.id,
      })
      return
    }

    void mutations.startTimer(nextInput, {
      onSuccess: (entry) => {
        const op = timerOperationRef.current
        if (!operationHasToken(op, token)) return

        if (op.kind === 'discarding') {
          setOptimisticActiveEntry(null)
          void deleteEntryFn({ data: { id: entry.id } }).finally(() => {
            if (operationHasToken(timerOperationRef.current, token)) {
              setTimerOperation({ kind: 'idle' })
            }
            void router.invalidate()
          })
          return
        }

        if (op.kind === 'stopping') {
          removeOptimisticStoppedEntry(op.entryId)
          performOptimisticStop(entry, token)
          return
        }

        setOptimisticActiveEntry(entry)
        setTimerOperation({
          kind: 'runningOptimistic',
          token,
          entryId: entry.id,
        })
      },
      onError: () => {
        if (!operationHasToken(timerOperationRef.current, token)) return
        setOptimisticActiveEntry(null)
        setTimerOperation({ kind: 'idle' })
        gooeyToast.error('Failed to start timer', {
          description: 'Please try again.',
        })
      },
    })
  }

  function stopTimer() {
    if (!activeEntry) return
    flushDescriptionSave()
    const entryToStop = activeEntry
    const currentOp = timerOperationRef.current

    if (entryToStop.id.startsWith('optimistic-')) {
      setOptimisticActiveEntry(null)
      const token =
        currentOp.kind === 'starting' ? currentOp.token : nextOperationToken()
      setTimerOperation({
        kind: 'stopping',
        token,
        entryId: entryToStop.id,
      })
      upsertOptimisticStoppedEntry(buildStoppedEntry(entryToStop))
      return
    }

    performOptimisticStop(entryToStop)
  }

  return {
    // Input state
    timerDescription,
    timerClientId,
    timerProjectId,
    timerTagIds,
    timerBillable,
    // Derived
    activeEntry,
    stopBlocked,
    optimisticStoppedEntries,
    // Suggestions
    descriptionSuggestions,
    // Change handlers
    changeTimerDescription,
    applyDescriptionSuggestion,
    changeTimerClient,
    changeTimerProject,
    changeTimerTagIds,
    changeTimerBillable,
    applyPreset,
    // Timer actions
    startTimer,
    stopTimer,
    discardTimer,
    resumeEntry,
    flushDescriptionSave,
    // Autosave (exposed for onUpdateStartedAt in inputSectionProps)
    persistActiveTimerStartedAt: (iso: string) => {
      if (!activeEntryBase || activeEntryBase.id.startsWith('optimistic-'))
        return
      void mutations.updateActiveTimer(
        {
          id: activeEntryBase.id,
          description: timerDescription.trim(),
          projectId: timerProjectId,
          tagIds: timerTagIds,
          billable: timerBillable,
          startedAt: iso,
        },
        { invalidate: false },
      )
    },
  }
}
