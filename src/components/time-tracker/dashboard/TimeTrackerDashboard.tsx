import { useEffect, useMemo } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { Play, Square } from 'lucide-react'
import { gooeyToast } from 'goey-toast'
import {
  formatDuration,
  formatViewRangeLabel,
  getLocalDateKey,
  getEntrySeconds,
  getViewRange,
  moveViewDate,
  useFilteredEntries,
} from '#/lib/time-tracker/store'
import { useTimeFormat } from '#/lib/time-tracker/useTimeFormat'
import {
  computeEffectiveRate,
  normalizeCurrency,
} from '#/lib/time-tracker/billing'
import type { TrackerState, ViewMode } from '#/lib/time-tracker/types'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '#/components/ui/drawer'
import { DashboardHeader } from './DashboardHeader'
import { InputSection } from './InputSection'
import { EntriesSection } from './EntriesSection'
import { EditEntryDrawer } from './EditEntryDrawer'
import { TimeFormatPicker } from './TimeFormatPicker'
import { useNowTick } from './hooks/useNowTick'
import { useTrackerMutations } from './hooks/useTrackerMutations'
import { useEntriesFilterSort } from './hooks/useEntriesFilterSort'
import { useDraftAndEdit } from './hooks/useDraftAndEdit'
import { useTimerCore } from './hooks/useTimerCore'
import { useTimerKeyboard } from './hooks/useTimerKeyboard'
import { useNetworkStatus } from '#/lib/time-tracker/useNetworkStatus'
import { startTimerFn, stopTimerFn, deleteEntryFn } from '#/lib/server/tracker'
import {
  loadOfflineQueue,
  removeOfflineQueueItem,
} from '#/lib/time-tracker/offline-queue'
import { BRAND } from '#/lib/brand'

export function TimeTrackerDashboard({
  state,
  view = 'week',
  date,
}: {
  state: TrackerState
  view?: ViewMode
  date: string
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const mutations = useTrackerMutations()
  const { isOnline } = useNetworkStatus()
  const tick = useNowTick(1000)
  const { format, setFormat, formatTime } = useTimeFormat(state.workspace.id)

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
  } = useDraftAndEdit({ state, mutations })

  const {
    timerDescription,
    timerClientId,
    timerProjectId,
    timerTagIds,
    timerBillable,
    activeEntry,
    stopBlocked,
    optimisticStoppedEntries,
    isTimerStarting,
    isTimerStopping,
    descriptionSuggestions,
    changeTimerDescription,
    applyDescriptionSuggestion,
    changeTimerClient,
    changeTimerProject,
    changeTimerTagIds,
    changeTimerBillable,
    applyPreset,
    startTimer,
    stopTimer,
    discardTimer,
    resumeEntry,
    persistActiveTimerStartedAt,
  } = useTimerCore({ state, mutations, isOnline })

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

  const baseFiltered = useFilteredEntries(
    state.entries,
    view,
    state.currentMemberId,
    date,
  )
  const selectedRange = useMemo(
    () => getViewRange(view, new Date(`${date}T00:00:00`)),
    [date, view],
  )
  const selectedRangeLabel = useMemo(
    () => formatViewRangeLabel(view, date),
    [date, view],
  )

  // When back online, drain any mutations that were queued while offline.
  useEffect(() => {
    if (!isOnline) return
    const queue = loadOfflineQueue(state.workspace.id)
    if (queue.length === 0) return

    async function drain() {
      const idMap = new Map<string, string>()
      for (const item of queue) {
        try {
          if (item.type === 'startTimer') {
            const entry = await startTimerFn({ data: item.payload })
            idMap.set(item.optimisticId, entry.id)
          } else if (item.type === 'stopTimer') {
            const realId = idMap.get(item.payload.id) ?? item.payload.id
            await stopTimerFn({ data: { id: realId } })
          } else {
            const realId = idMap.get(item.payload.id) ?? item.payload.id
            await deleteEntryFn({ data: { id: realId } })
          }
          removeOfflineQueueItem(state.workspace.id, item.id)
        } catch (err) {
          gooeyToast.error('Failed to sync offline action', {
            description:
              err instanceof Error ? err.message : 'Check your connection.',
          })
          return
        }
      }
      void router.invalidate()
    }

    void drain()
  }, [isOnline])

  // Update the browser tab title and emit state to the Chrome extension side panel.
  useEffect(() => {
    const elapsedSeconds = activeEntry ? getEntrySeconds(activeEntry, tick) : 0

    if (activeEntry) {
      const elapsed = formatDuration(elapsedSeconds)
      const desc = activeEntry.description.trim() || 'Timer running'
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

    if (typeof window === 'undefined' || window.parent === window) return
    window.parent.postMessage(
      { type: 'CLOCKIFY_TIMER_STATE', running: !!activeEntry, elapsedSeconds },
      '*',
    )
  }, [activeEntry, tick])

  const {
    filteredEntries: serverFilteredEntries,
    activeFilterCount,
    clearFilters,
    controls: filterControls,
  } = useEntriesFilterSort(baseFiltered, tick)

  const pendingEntryIds = useMemo(
    () => new Set(optimisticStoppedEntries.map((e) => e.id)),
    [optimisticStoppedEntries],
  )

  const pendingInRange = useMemo(() => {
    return optimisticStoppedEntries.filter((e) => {
      const t = new Date(e.startedAt).getTime()
      return (
        t >= selectedRange.start.getTime() && t < selectedRange.end.getTime()
      )
    })
  }, [optimisticStoppedEntries, selectedRange])

  // Merge pending stopped entries into the visible list so they appear instantly.
  const filteredEntries = useMemo(() => {
    if (pendingInRange.length === 0) return serverFilteredEntries
    const realIds = new Set(serverFilteredEntries.map((e) => e.id))
    const newPending = pendingInRange.filter((e) => !realIds.has(e.id))
    return newPending.length > 0
      ? [...serverFilteredEntries, ...newPending]
      : serverFilteredEntries
  }, [serverFilteredEntries, pendingInRange])

  const mergedBaseFiltered = useMemo(() => {
    if (pendingInRange.length === 0) return baseFiltered
    const realIds = new Set(baseFiltered.map((e) => e.id))
    const newPending = pendingInRange.filter((e) => !realIds.has(e.id))
    return newPending.length > 0
      ? [...baseFiltered, ...newPending]
      : baseFiltered
  }, [baseFiltered, pendingInRange])

  const currency = normalizeCurrency(state.workspace.billableCurrency)
  const defaultRate = state.workspace.defaultBillableRate
  const rateLookup = useMemo(() => {
    const byMember = new Map(
      state.members.map((m) => [
        m.id,
        computeEffectiveRate(m.billableRate ?? null, defaultRate),
      ]),
    )
    return (memberId: string) => byMember.get(memberId) ?? defaultRate
  }, [state.members, defaultRate])

  // Pre-sum completed entries — stable between ticks, only recalculates when
  // the entry list itself changes.
  const completedTotals = useMemo(() => {
    return mergedBaseFiltered
      .filter((e) => !!e.endedAt)
      .reduce((sum, e) => sum + e.durationSeconds, 0)
  }, [mergedBaseFiltered])

  // The single running entry's live contribution — only this part ticks.
  const runningEntry = mergedBaseFiltered.find((e) => !e.endedAt)
  const runningSeconds = runningEntry ? getEntrySeconds(runningEntry, tick) : 0

  const totals = { selectedTotal: completedTotals + runningSeconds }

  function changeView(nextView: ViewMode) {
    void navigate({
      to: '/app/time-tracker',
      search: { view: nextView, date },
    })
  }

  function changeDate(nextDate: string) {
    void navigate({
      to: '/app/time-tracker',
      search: { view, date: nextDate },
    })
  }

  function moveSelectedDate(direction: -1 | 1) {
    changeDate(moveViewDate(view, date, direction))
  }

  function resetSelectedDate() {
    changeDate(getLocalDateKey())
  }

  const inputSectionProps = {
    workspaceId: state.workspace.id,
    clients: state.clients,
    projects: state.projects,
    tags: state.tags,
    description: timerDescription,
    onDescriptionChange: changeTimerDescription,
    descriptionSuggestions,
    onApplySuggestion: applyDescriptionSuggestion,
    clientId: timerClientId,
    onClientIdChange: changeTimerClient,
    projectId: timerProjectId,
    onProjectIdChange: changeTimerProject,
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
    onCreateTag: mutations.createTag,
    canManageCatalog,
    pending: mutations.pending,
    startPending: isTimerStarting,
    stopPending: isTimerStopping,
    formatTime,
  }

  return (
    <div className="grid gap-6">
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
        >
          You&apos;re offline. Actions are queued and will sync when you
          reconnect.
        </div>
      )}
      <DashboardHeader
        workspaceName={state.workspace.name}
        userName={currentUser.name}
        userRoleName={currentUser.roleName}
        view={view}
        onChangeView={changeView}
        selectedDate={date}
        selectedRangeLabel={selectedRangeLabel}
        onPreviousPeriod={() => moveSelectedDate(-1)}
        onNextPeriod={() => moveSelectedDate(1)}
        onCurrentPeriod={resetSelectedDate}
        onSelectDate={changeDate}
        selectedTotalSeconds={totals.selectedTotal}
        formatTime={formatTime}
        trailing={<TimeFormatPicker format={format} onChange={setFormat} />}
      />

      {/* Desktop: inline input section */}
      <div className="hidden sm:block">
        <InputSection {...inputSectionProps} />
      </div>

      <EntriesSection
        range={selectedRange}
        baseFiltered={mergedBaseFiltered}
        filteredEntries={filteredEntries}
        activeFilterCount={activeFilterCount}
        clearFilters={clearFilters}
        filterControls={filterControls}
        projects={state.projects}
        tags={state.tags}
        currency={currency}
        rateLookup={rateLookup}
        pending={mutations.pending}
        pendingEntryIds={pendingEntryIds}
        formatTime={formatTime}
        hasActiveTimer={!!activeEntry}
        onStartEdit={startEdit}
        onUpdate={handleInlineUpdate}
        onResume={resumeEntry}
        onDuplicate={mutations.duplicateEntry}
        onDelete={mutations.deleteEntry}
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
        tags={state.tags}
        canManageCatalog={canManageCatalog}
        pending={mutations.pending}
        onSave={saveEdit}
        onCancel={() => setEditingId(null)}
        onCreateClient={mutations.createClient}
        onCreateProject={mutations.createProject}
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
        className={`fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-colors sm:hidden ${
          activeEntry
            ? 'bg-destructive text-destructive-foreground'
            : 'bg-primary text-primary-foreground'
        }`}
      >
        {activeEntry ? (
          <Square className="h-5 w-5 fill-current" />
        ) : (
          <Play className="h-5 w-5" />
        )}
      </button>

      {/* Mobile: bottom drawer with timer / manual entry */}
      <Drawer open={mobileTimerOpen} onOpenChange={setMobileTimerOpen}>
        <DrawerContent className="sm:hidden">
          <DrawerHeader className="border-b border-border pb-3">
            <DrawerTitle>
              {activeEntry ? 'Timer running' : 'Track time'}
            </DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto p-4 pb-8">
            <InputSection {...inputSectionProps} />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
