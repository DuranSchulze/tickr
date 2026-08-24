import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Play, Square, X } from 'lucide-react'
import { gooeyToast } from '#/lib/toast'
import {
  formatDuration,
  getEntrySeconds,
  entryOverlapsRange,
  parseLocalDateKey,
} from '#/lib/time-tracker/store'
import { useTimeFormat } from '#/lib/time-tracker/useTimeFormat'
import {
  computeBillableRate,
  normalizeCurrency,
} from '#/lib/time-tracker/billing'
import type { TimeEntry, TrackerState } from '#/lib/time-tracker/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '#/components/ui/dialog'
import { DashboardHeader } from './DashboardHeader'
import { InputSection } from './InputSection'
import { AllEntriesSection } from './AllEntriesSection'
import type { EntriesDateRange } from './EntriesDateRangeFilter'
import { EditEntryDrawer } from './EditEntryDrawer'
import { useTrackerMutations } from './hooks/useTrackerMutations'
import { useEntriesFilterSort } from './hooks/useEntriesFilterSort'
import { useDraftAndEdit } from './hooks/useDraftAndEdit'
import { useTimerCore } from './hooks/useTimerCore'
import { useRemoteTaskDataSync } from './hooks/useRemoteTaskDataSync'
import { useTimerKeyboard } from './hooks/useTimerKeyboard'
import { useNetworkStatus } from '#/lib/time-tracker/useNetworkStatus'
import {
  createManualEntryFn,
  startTimerFn,
  stopTimerFn,
  deleteEntryFn,
  getPaginatedEntriesFn,
} from '#/lib/server/tracker'
import {
  loadOfflineQueue,
  removeOfflineQueueItem,
} from '#/lib/time-tracker/offline-queue'
import { invalidateTrackerState } from '#/lib/time-tracker/query-keys'
import { useQueryClient } from '@tanstack/react-query'
import { BRAND } from '#/lib/brand'
import { MemberExportButton } from '#/components/time-tracker/shared/MemberExportDialog'
import { FeedbackFloatingPanel } from './FeedbackForm'
import {
  publishTaskDataChange,
  subscribeToTaskSyncCompleted,
} from '#/lib/time-tracker/task-sync'

export function TimeTrackerDashboard({
  state,
  focusTimer = false,
}: {
  state: TrackerState
  /** Deep link from reminder emails — scroll to and focus the timer input. */
  focusTimer?: boolean
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const mutations = useTrackerMutations(
    state.workspace.id,
    state.workspace.locationTrackingEnabled,
  )
  const { isOnline } = useNetworkStatus()
  const { formatTime } = useTimeFormat()

  useEffect(() => {
    if (!focusTimer) return
    const section = document.getElementById('timer-input-section')
    if (!section) return
    section.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (window.matchMedia('(min-width: 640px)').matches) {
      const input = section.querySelector<HTMLInputElement>('input')
      window.setTimeout(() => {
        input?.focus({ preventScroll: true })
      }, 400)
    }
  }, [focusTimer])

  // ── "All entries" paginated state ────────────────────────────────────────────
  // Declared before useDraftAndEdit so edits in the "all" view can resolve
  // entries that fall outside state.entries' 90-day window, and so mutations can
  // refresh this locally-held list (router.invalidate only refreshes state).
  const [allEntries, setAllEntries] = useState<TimeEntry[]>([])
  const [allEntriesCursor, setAllEntriesCursor] = useState<string | null>(null)
  const [allEntriesLoading, setAllEntriesLoading] = useState(false)
  const [allEntriesHasMore, setAllEntriesHasMore] = useState(false)
  const [entriesDateRange, setEntriesDateRange] =
    useState<EntriesDateRange | null>(null)
  const allEntriesInitialized = useRef(false)
  const allEntriesRequestId = useRef(0)

  const loadAllEntries = useCallback(
    async (
      reset = false,
      range: EntriesDateRange | null = entriesDateRange,
    ) => {
      if (allEntriesLoading && !reset) return
      const requestId = ++allEntriesRequestId.current
      setAllEntriesLoading(true)
      try {
        const cursor = reset ? undefined : (allEntriesCursor ?? undefined)
        const result = await getPaginatedEntriesFn({
          data: {
            cursor,
            limit: 50,
            startDate: range?.startDate,
            endDate: range?.endDate,
          },
        })
        if (requestId !== allEntriesRequestId.current) return
        if (reset) {
          setAllEntries(result.entries)
        } else {
          setAllEntries((prev) => [...prev, ...result.entries])
        }
        setAllEntriesCursor(result.nextCursor)
        setAllEntriesHasMore(result.nextCursor !== null)
      } catch {
        // silently fail — user can retry via "Load more"
      } finally {
        if (requestId === allEntriesRequestId.current) {
          setAllEntriesLoading(false)
        }
      }
    },
    [allEntriesLoading, allEntriesCursor, entriesDateRange],
  )

  // After a mutation, refresh the "all" view's locally-paginated list (it isn't
  // backed by the route loader, so router.invalidate alone leaves it stale).
  const refreshAllEntries = useCallback(() => {
    if (allEntriesInitialized.current) {
      void loadAllEntries(true)
    }
  }, [loadAllEntries])

  useEffect(
    () =>
      subscribeToTaskSyncCompleted((event) => {
        if (
          event.workspaceId === state.workspace.id &&
          allEntriesInitialized.current
        ) {
          void loadAllEntries(true)
        }
      }),
    [loadAllEntries, state.workspace.id],
  )

  // Independent refresh leg for the locally-paginated list: reacts to the
  // cross-tab broadcast directly instead of relying solely on the coordinator's
  // completion notification, so a failed coordinator refresh can no longer
  // leave stale rows (e.g. an entry still "running" after another tab stopped
  // it) next to fresh route-loader state.
  useRemoteTaskDataSync(state.workspace.id, refreshAllEntries)

  const patchAllEntries = useCallback((updated: TimeEntry) => {
    setAllEntries((prev) =>
      prev.map((entry) => (entry.id === updated.id ? updated : entry)),
    )
  }, [])

  // Delete/duplicate go straight through mutations (they don't read entry
  // state), so they just need to refresh the "all" list on success.
  const handleDeleteEntry = useCallback(
    (id: string) =>
      mutations.deleteEntry(id, {
        onSuccess: () => {
          setAllEntries((prev) => prev.filter((entry) => entry.id !== id))
          refreshAllEntries()
        },
      }),
    [mutations, refreshAllEntries],
  )
  const handleDuplicateEntry = useCallback(
    (id: string) =>
      mutations.duplicateEntry(id, { onSuccess: refreshAllEntries }),
    [mutations, refreshAllEntries],
  )

  // Entries to resolve edits against: state.entries (last 90 days) plus the
  // paginated "all" list, which can include older entries. state.entries wins
  // on conflict since it's refreshed by the route loader.
  const lookupEntries = useMemo(() => {
    if (allEntries.length === 0) return state.entries
    const byId = new Map<string, TimeEntry>()
    for (const e of allEntries) byId.set(e.id, e)
    for (const e of state.entries) byId.set(e.id, e)
    return Array.from(byId.values())
  }, [state.entries, allEntries])

  const {
    timerDescription,
    timerClientId,
    timerProjectId,
    timerTaskId,
    timerTagIds,
    timerBillable,
    activeEntry,
    stopBlocked,
    optimisticStoppedEntries,
    upsertOptimisticStoppedEntry,
    removeOptimisticStoppedEntry,
    isTimerStarting,
    isTimerStopping,
    descriptionSuggestions,
    changeTimerDescription,
    applyDescriptionSuggestion,
    changeTimerClient,
    changeTimerProject,
    changeTimerTask,
    changeTimerTagIds,
    changeTimerBillable,
    applyPreset,
    startTimer,
    stopTimer,
    discardTimer,
    resumeEntry,
    flushDescriptionSave,
    persistActiveTimerStartedAt,
  } = useTimerCore({ state, mutations, isOnline, onMutated: refreshAllEntries })

  const {
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
  } = useDraftAndEdit({
    state,
    mutations,
    lookupEntries,
    onMutated: refreshAllEntries,
    onEntryPatched: patchAllEntries,
    isOnline,
    onOfflineCreate: upsertOptimisticStoppedEntry,
  })

  useTimerKeyboard({
    activeEntry,
    stopBlocked,
    startTimer,
    stopTimer,
    discardTimer,
  })

  const currentUser = state.members.find((m) => m.id === state.currentMemberId)!
  const canManageCatalog =
    currentUser.permissionLevel === 'OWNER' ||
    currentUser.permissionLevel === 'ADMIN'

  useEffect(() => {
    if (!allEntriesInitialized.current) {
      allEntriesInitialized.current = true
      void loadAllEntries(true)
    }
  }, [loadAllEntries])

  // When back online, drain any mutations that were queued while offline.
  // Each replay carries its original client timestamps, so synced entries keep
  // the times the user actually worked instead of the reconnect time.
  const drainingRef = useRef(false)
  useEffect(() => {
    if (!isOnline || drainingRef.current) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    const queue = loadOfflineQueue(state.workspace.id, state.currentMemberId)
    if (queue.length === 0) return
    drainingRef.current = true

    // A fetch-level failure means we're effectively offline again; a server
    // response with an error means the action itself was rejected.
    function isNetworkError(err: unknown) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return true
      return err instanceof TypeError
    }

    async function drain() {
      const idMap = new Map<string, string>()
      const failedIds = new Set<string>()
      let replayedAny = false

      for (const item of queue) {
        // Drop actions that depend on a start/create the server rejected —
        // their target entry will never exist.
        const dependsOn =
          item.type === 'stopTimer' || item.type === 'discardTimer'
            ? item.payload.id
            : null
        if (dependsOn && failedIds.has(dependsOn)) {
          removeOfflineQueueItem(
            state.workspace.id,
            state.currentMemberId,
            item.id,
          )
          removeOptimisticStoppedEntry(dependsOn)
          continue
        }

        try {
          if (item.type === 'startTimer') {
            const entry = await startTimerFn({ data: item.payload })
            idMap.set(item.optimisticId, entry.id)
          } else if (item.type === 'createManualEntry') {
            await createManualEntryFn({ data: item.payload })
            removeOptimisticStoppedEntry(item.optimisticId)
          } else if (item.type === 'stopTimer') {
            const { id, ...overrides } = item.payload
            const realId = idMap.get(id) ?? id
            await stopTimerFn({ data: { id: realId, ...overrides } })
            // The pending entry was stored under its optimistic id; the synced
            // one arrives under the real id on the next invalidate.
            if (realId !== id) removeOptimisticStoppedEntry(id)
          } else {
            const realId = idMap.get(item.payload.id) ?? item.payload.id
            await deleteEntryFn({ data: { id: realId } })
          }
          removeOfflineQueueItem(
            state.workspace.id,
            state.currentMemberId,
            item.id,
          )
          replayedAny = true
        } catch (err) {
          if (isNetworkError(err)) {
            // Connection dropped again — keep the remaining items and retry
            // on the next reconnect.
            break
          }
          // Server rejected the action — drop it so one poisoned item can't
          // stall the queue forever, and clean up its optimistic entry.
          removeOfflineQueueItem(
            state.workspace.id,
            state.currentMemberId,
            item.id,
          )
          if (item.type === 'startTimer' || item.type === 'createManualEntry') {
            failedIds.add(item.optimisticId)
            removeOptimisticStoppedEntry(item.optimisticId)
          }
          gooeyToast.error('Failed to sync offline action', {
            description:
              err instanceof Error ? err.message : 'Something went wrong.',
          })
        }
      }

      drainingRef.current = false
      if (replayedAny) {
        publishTaskDataChange(state.workspace.id)
        void invalidateTrackerState(queryClient)
        void router.invalidate()
      }
    }

    void drain()
  }, [isOnline, state.currentMemberId, state.workspace.id])

  // Update the browser tab title and emit state to the Chrome extension side panel.
  // Owns its own interval so the dashboard doesn't re-render every second.
  // The entry is read through a ref so the interval survives dashboard
  // re-renders (activeEntry gets a fresh identity on each one) and is only
  // re-created when the timer actually starts or stops.
  const activeEntryRef = useRef(activeEntry)
  activeEntryRef.current = activeEntry
  const activeEntryId = activeEntry?.id
  useEffect(() => {
    function update() {
      const entry = activeEntryRef.current
      const elapsedSeconds = entry ? getEntrySeconds(entry, Date.now()) : 0

      if (entry) {
        const elapsed = formatDuration(elapsedSeconds)
        const desc = entry.description.trim() || 'Timer running'
        document.title = `${elapsed} · ${desc} — ${BRAND.name}`
      } else {
        const now = new Date()
        const timeString = now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
        document.title = `${timeString} — ${BRAND.name}`
      }

      if (typeof window !== 'undefined' && window.parent !== window) {
        window.parent.postMessage(
          {
            type: 'TRACKLY_TIMER_STATE',
            running: !!entry,
            elapsedSeconds,
          },
          '*',
        )
      }
    }

    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [activeEntryId])

  const pendingEntryIds = useMemo(
    () => new Set(optimisticStoppedEntries.map((e) => e.id)),
    [optimisticStoppedEntries],
  )

  const pendingInRange = useMemo(() => {
    if (!entriesDateRange) return optimisticStoppedEntries
    const start = parseLocalDateKey(entriesDateRange.startDate)
    const end = parseLocalDateKey(entriesDateRange.endDate)
    end.setDate(end.getDate() + 1)
    return optimisticStoppedEntries.filter((e) =>
      entryOverlapsRange(e, start, end),
    )
  }, [entriesDateRange, optimisticStoppedEntries])

  const visibleEntriesSource = useMemo(() => {
    const byId = new Map(allEntries.map((entry) => [entry.id, entry]))
    for (const entry of pendingInRange) byId.set(entry.id, entry)
    if (
      activeEntry &&
      (!entriesDateRange ||
        entryOverlapsRange(
          activeEntry,
          parseLocalDateKey(entriesDateRange.startDate),
          new Date(
            parseLocalDateKey(entriesDateRange.endDate).getTime() +
              24 * 60 * 60 * 1000,
          ),
        ))
    ) {
      byId.set(activeEntry.id, activeEntry)
    }
    return Array.from(byId.values())
  }, [activeEntry, allEntries, entriesDateRange, pendingInRange])

  const {
    filteredEntries,
    activeFilterCount,
    clearFilters,
    controls: filterControls,
  } = useEntriesFilterSort(visibleEntriesSource)

  const currency = normalizeCurrency(state.workspace.billableCurrency)
  const defaultRate = state.workspace.defaultBillableRate
  const rateLookup = useMemo(() => {
    const byMember = new Map(
      state.members.map((m) => [m.id, m.billableRate ?? null]),
    )
    const projectClient = new Map(
      state.projects.map((project) => [project.id, project.clientId]),
    )
    const clientDefaultRate = new Map(
      state.clients.map((client) => [client.id, client.defaultBillableRate]),
    )
    return (memberId: string, projectId?: string, dateIso?: string) => {
      const memberRate = byMember.get(memberId) ?? null
      const clientId = projectId ? projectClient.get(projectId) : null
      const dateKey = dateIso ? dateIso.slice(0, 10) : null
      const clientRate =
        clientId && dateKey
          ? (state.memberClientBillableRates
              .filter(
                (rate) =>
                  rate.workspaceMemberId === memberId &&
                  rate.clientId === clientId &&
                  rate.effectiveFrom <= dateKey &&
                  (rate.effectiveTo == null || rate.effectiveTo >= dateKey),
              )
              .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]
              ?.billableRate ?? null)
          : null
      return computeBillableRate({
        memberClientRate: clientRate,
        clientDefaultRate: clientId
          ? (clientDefaultRate.get(clientId) ?? null)
          : null,
        memberRate,
        workspaceDefaultRate: defaultRate,
      })
    }
  }, [
    defaultRate,
    state.clients,
    state.memberClientBillableRates,
    state.members,
    state.projects,
  ])

  const summaryEntries = useMemo(() => {
    const byId = new Map(state.entries.map((entry) => [entry.id, entry]))
    for (const entry of optimisticStoppedEntries) byId.set(entry.id, entry)
    return Array.from(byId.values())
  }, [optimisticStoppedEntries, state.entries])

  const combinedActiveFilterCount =
    activeFilterCount + (entriesDateRange ? 1 : 0)

  function handleClearFilters() {
    clearFilters()
    if (entriesDateRange) {
      setEntriesDateRange(null)
      void loadAllEntries(true, null)
    }
  }

  function handleDateRangeChange(range: EntriesDateRange | null) {
    setEntriesDateRange(range)
    void loadAllEntries(true, range)
  }

  const handleCreateTask = useCallback(
    (projectId: string, name: string) => mutations.createTask(projectId, name),
    [mutations.createTask],
  )
  const handleDeleteTask = useCallback(
    (id: string) => mutations.deleteTask(id).then(() => undefined as void),
    [mutations.deleteTask],
  )

  const inputSectionProps = useMemo(
    () => ({
      workspaceId: state.workspace.id,
      clients: state.clients,
      projects: state.projects,
      tags: state.tags,
      description: timerDescription,
      onDescriptionChange: changeTimerDescription,
      onDescriptionBlur: flushDescriptionSave,
      descriptionSuggestions,
      onApplySuggestion: applyDescriptionSuggestion,
      clientId: timerClientId,
      onClientIdChange: changeTimerClient,
      projectId: timerProjectId,
      onProjectIdChange: changeTimerProject,
      taskId: timerTaskId,
      onTaskIdChange: changeTimerTask,
      projectTasks: state.projectTasks,
      tagIds: timerTagIds,
      onTagIdsChange: changeTimerTagIds,
      billable: timerBillable,
      onBillableChange: changeTimerBillable,
      activeEntry,
      onApplyPreset: applyPreset,
      onStart: startTimer,
      onStop: stopTimer,
      onDiscard: discardTimer,
      onUpdateStartedAt: persistActiveTimerStartedAt,
      draft,
      setDraft,
      onAddManual: addManualEntry,
      onCreateClient: mutations.createClient,
      onCreateProject: mutations.createProject,
      onCreateTask: handleCreateTask,
      onDeleteTask: handleDeleteTask,
      onCreateTag: mutations.createTag,
      canManageCatalog,
      pending: mutations.pending,
      startPending: isTimerStarting,
      stopPending: isTimerStopping,
      formatTime,
    }),
    [
      state.workspace.id,
      state.clients,
      state.projects,
      state.tags,
      timerDescription,
      changeTimerDescription,
      flushDescriptionSave,
      descriptionSuggestions,
      applyDescriptionSuggestion,
      timerClientId,
      changeTimerClient,
      timerProjectId,
      changeTimerProject,
      timerTaskId,
      changeTimerTask,
      state.projectTasks,
      timerTagIds,
      changeTimerTagIds,
      timerBillable,
      changeTimerBillable,
      activeEntry,
      applyPreset,
      startTimer,
      stopTimer,
      discardTimer,
      persistActiveTimerStartedAt,
      draft,
      setDraft,
      addManualEntry,
      mutations.createClient,
      mutations.createProject,
      handleCreateTask,
      handleDeleteTask,
      mutations.createTag,
      canManageCatalog,
      mutations.pending,
      isTimerStarting,
      isTimerStopping,
      formatTime,
    ],
  )

  const exportButton = useMemo(
    () => (
      <MemberExportButton
        memberId={state.currentMemberId}
        label="Export my time"
      />
    ),
    [state.currentMemberId],
  )

  return (
    <div className="grid min-w-0 gap-6">
      {!isOnline && (
        <output
          aria-live="polite"
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
        >
          You&apos;re offline. Actions are queued and will sync when you
          reconnect.
        </output>
      )}
      <DashboardHeader
        workspaceName={state.workspace.name}
        userName={currentUser.name}
        userRoleName={currentUser.roleName}
        entries={summaryEntries}
        formatTime={formatTime}
        trailing={exportButton}
      />

      {/* Desktop: inline input section */}
      <div id="timer-input-section" className="hidden min-w-0 sm:block">
        <InputSection {...inputSectionProps} />
      </div>

      <AllEntriesSection
        entries={filteredEntries}
        activeEntry={activeEntry}
        hasMore={allEntriesHasMore}
        loadingMore={allEntriesLoading}
        onLoadMore={() => void loadAllEntries(false)}
        dateRange={entriesDateRange}
        onDateRangeChange={handleDateRangeChange}
        activeFilterCount={combinedActiveFilterCount}
        clearFilters={handleClearFilters}
        filterControls={filterControls}
        clients={state.clients}
        projects={state.projects}
        projectTasks={state.projectTasks}
        tags={state.tags}
        currency={currency}
        rateLookup={rateLookup}
        pending={mutations.pending}
        pendingEntryIds={pendingEntryIds}
        deletingEntryId={mutations.deletingEntryId}
        formatTime={formatTime}
        onStartEdit={startEdit}
        onUpdate={handleInlineUpdate}
        onResume={resumeEntry}
        onDuplicate={handleDuplicateEntry}
        onDelete={handleDeleteEntry}
      />

      <EditEntryDrawer
        open={!!editingId}
        onOpenChange={(open) => {
          if (!open) setEditingId(null)
        }}
        entry={editingEntry}
        editingDraft={editingDraft}
        setEditingDraft={setEditingDraft}
        clients={state.clients}
        projects={state.projects}
        projectTasks={state.projectTasks}
        tags={state.tags}
        canManageCatalog={canManageCatalog}
        pending={mutations.pending}
        onSave={saveEdit}
        onCancel={() => setEditingId(null)}
        onCreateClient={mutations.createClient}
        onCreateProject={mutations.createProject}
        onCreateTask={handleCreateTask}
        onDeleteTask={(id) => mutations.deleteTask(id).then(() => undefined)}
        onCreateTag={mutations.createTag}
      />

      {/* Mobile: floating action button */}
      <button
        type="button"
        onClick={() => {
          if (activeEntry && !stopBlocked) {
            stopTimer()
          } else {
            setMobileTimerOpen(true)
          }
        }}
        aria-label={
          activeEntry
            ? stopBlocked
              ? 'Timer running – tap to complete missing fields'
              : 'Stop timer'
            : 'Start timer'
        }
        className={`fixed bottom-20 right-4 z-50 flex size-14 items-center justify-center rounded-full shadow-xl transition-colors sm:hidden ${
          activeEntry
            ? 'bg-destructive text-destructive-foreground'
            : 'bg-primary text-primary-foreground'
        }`}
      >
        {activeEntry ? (
          <Square className="size-5 fill-current" />
        ) : (
          <Play className="size-5" />
        )}
      </button>

      {/* Mobile: full-screen dialog for timer / manual entry */}
      <Dialog open={mobileTimerOpen} onOpenChange={setMobileTimerOpen}>
        <DialogContent
          className="sm:hidden fixed inset-0 z-50 m-0 flex flex-col max-w-none translate-x-0 translate-y-0 gap-0 rounded-none bg-card p-0 duration-200 outline-none data-open:animate-in data-open:slide-in-from-bottom data-closed:animate-out data-closed:slide-out-to-bottom"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">
            {activeEntry ? 'Timer running' : 'Track time'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {activeEntry
              ? 'Review and stop the current timer.'
              : 'Start a timer or create a manual time entry.'}
          </DialogDescription>
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-lg font-bold text-foreground">
              {activeEntry ? 'Timer running' : 'Track time'}
            </h2>
            <button
              type="button"
              onClick={() => setMobileTimerOpen(false)}
              className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Body — pushed to bottom so inputs are near the keyboard */}
          <div className="mt-auto w-full overflow-y-auto px-4 pb-8 pt-4">
            <InputSection {...inputSectionProps} descriptionDropdownUp />
          </div>
        </DialogContent>
      </Dialog>

      {/* Floating feedback form — accessible anywhere on the dashboard */}
      <FeedbackFloatingPanel />
    </div>
  )
}
