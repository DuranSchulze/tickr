import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { FileText, Loader2, Play, Square } from 'lucide-react'
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
  formatCurrency,
  normalizeCurrency,
} from '#/lib/time-tracker/billing'
import type {
  TimeEntry,
  TrackerState,
  ViewMode,
} from '#/lib/time-tracker/types'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '#/components/ui/drawer'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'
import { DashboardHeader } from './DashboardHeader'
import { InputSection } from './InputSection'
import { EntriesSection } from './EntriesSection'
import { AllEntriesSection } from './AllEntriesSection'
import { EditEntryDrawer } from './EditEntryDrawer'
import { useTrackerMutations } from './hooks/useTrackerMutations'
import { useEntriesFilterSort } from './hooks/useEntriesFilterSort'
import { useDraftAndEdit } from './hooks/useDraftAndEdit'
import { useTimerCore } from './hooks/useTimerCore'
import { useTimerKeyboard } from './hooks/useTimerKeyboard'
import { useNetworkStatus } from '#/lib/time-tracker/useNetworkStatus'
import {
  createManualEntryFn,
  startTimerFn,
  stopTimerFn,
  deleteEntryFn,
  getPaginatedEntriesFn,
  getMemberMonthlyReportFn,
} from '#/lib/server/tracker'
import {
  loadOfflineQueue,
  removeOfflineQueueItem,
} from '#/lib/time-tracker/offline-queue'
import { invalidateTrackerState } from '#/lib/time-tracker/query-keys'
import { useQueryClient } from '@tanstack/react-query'
import { BRAND } from '#/lib/brand'

export function TimeTrackerDashboard({
  state,
  view = 'day',
  date,
}: {
  state: TrackerState
  view?: ViewMode
  date: string
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const queryClient = useQueryClient()
  const mutations = useTrackerMutations()
  const { isOnline } = useNetworkStatus()
  const { formatTime } = useTimeFormat(state.workspace.id)

  // ── "All entries" paginated state ────────────────────────────────────────────
  // Declared before useDraftAndEdit so edits in the "all" view can resolve
  // entries that fall outside state.entries' 90-day window, and so mutations can
  // refresh this locally-held list (router.invalidate only refreshes state).
  const [allEntries, setAllEntries] = useState<TimeEntry[]>([])
  const [allEntriesCursor, setAllEntriesCursor] = useState<string | null>(null)
  const [allEntriesLoading, setAllEntriesLoading] = useState(false)
  const [allEntriesHasMore, setAllEntriesHasMore] = useState(false)
  const [allEntriesTotalCount, setAllEntriesTotalCount] = useState(0)
  const allEntriesInitialized = useRef(false)

  const loadAllEntries = useCallback(
    async (reset = false) => {
      if (allEntriesLoading) return
      setAllEntriesLoading(true)
      try {
        const cursor = reset ? undefined : (allEntriesCursor ?? undefined)
        const result = await getPaginatedEntriesFn({
          data: { cursor, limit: 50 },
        })
        if (reset) {
          setAllEntries(result.entries)
        } else {
          setAllEntries((prev) => [...prev, ...result.entries])
        }
        setAllEntriesCursor(result.nextCursor)
        setAllEntriesHasMore(result.nextCursor !== null)
        setAllEntriesTotalCount(result.totalCount)
      } catch {
        // silently fail — user can retry via "Load more"
      } finally {
        setAllEntriesLoading(false)
      }
    },
    [allEntriesLoading, allEntriesCursor],
  )

  // After a mutation, refresh the "all" view's locally-paginated list (it isn't
  // backed by the route loader, so router.invalidate alone leaves it stale).
  const refreshAllEntries = useCallback(() => {
    if (view === 'all' && allEntriesInitialized.current) {
      void loadAllEntries(true)
    }
  }, [view, loadAllEntries])

  // Delete/duplicate go straight through mutations (they don't read entry
  // state), so they just need to refresh the "all" list on success.
  const handleDeleteEntry = useCallback(
    (id: string) => mutations.deleteEntry(id, { onSuccess: refreshAllEntries }),
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
    changeTimerTagIds,
    changeTimerBillable,
    applyPreset,
    startTimer,
    stopTimer,
    discardTimer,
    resumeEntry,
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
    if (view === 'all') {
      if (!allEntriesInitialized.current) {
        allEntriesInitialized.current = true
        void loadAllEntries(true)
      }
    } else {
      allEntriesInitialized.current = false
    }
  }, [view])

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
  // Each replay carries its original client timestamps, so synced entries keep
  // the times the user actually worked instead of the reconnect time.
  const drainingRef = useRef(false)
  useEffect(() => {
    if (!isOnline || drainingRef.current) return
    const queue = loadOfflineQueue(state.workspace.id)
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
          removeOfflineQueueItem(state.workspace.id, item.id)
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
          removeOfflineQueueItem(state.workspace.id, item.id)
          replayedAny = true
        } catch (err) {
          if (isNetworkError(err)) {
            // Connection dropped again — keep the remaining items and retry
            // on the next reconnect.
            break
          }
          // Server rejected the action — drop it so one poisoned item can't
          // stall the queue forever, and clean up its optimistic entry.
          removeOfflineQueueItem(state.workspace.id, item.id)
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
        void invalidateTrackerState(queryClient)
        void router.invalidate()
      }
    }

    void drain()
  }, [isOnline, state.workspace.id])

  // Update the browser tab title and emit state to the Chrome extension side panel.
  // Owns its own interval so the dashboard doesn't re-render every second.
  useEffect(() => {
    function update() {
      const elapsedSeconds = activeEntry
        ? getEntrySeconds(activeEntry, Date.now())
        : 0

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

      if (typeof window !== 'undefined' && window.parent !== window) {
        window.parent.postMessage(
          {
            type: 'CLOCKIFY_TIMER_STATE',
            running: !!activeEntry,
            elapsedSeconds,
          },
          '*',
        )
      }
    }

    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [activeEntry])

  const {
    filteredEntries: serverFilteredEntries,
    activeFilterCount,
    clearFilters,
    controls: filterControls,
  } = useEntriesFilterSort(view === 'all' ? allEntries : baseFiltered)

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
  // When a pending entry shares an id with a server row (e.g. a just-stopped timer
  // that the server still reports as running until the next invalidate), the pending
  // version wins — otherwise the row would keep showing as "running" until a reload.
  const filteredEntries = useMemo(() => {
    if (pendingInRange.length === 0) return serverFilteredEntries
    const pendingById = new Map(pendingInRange.map((e) => [e.id, e]))
    const merged = serverFilteredEntries.map((e) => pendingById.get(e.id) ?? e)
    const realIds = new Set(serverFilteredEntries.map((e) => e.id))
    const newPending = pendingInRange.filter((e) => !realIds.has(e.id))
    return newPending.length > 0 ? [...merged, ...newPending] : merged
  }, [serverFilteredEntries, pendingInRange])

  const mergedBaseFiltered = useMemo(() => {
    if (pendingInRange.length === 0) return baseFiltered
    const pendingById = new Map(pendingInRange.map((e) => [e.id, e]))
    const merged = baseFiltered.map((e) => pendingById.get(e.id) ?? e)
    const realIds = new Set(baseFiltered.map((e) => e.id))
    const newPending = pendingInRange.filter((e) => !realIds.has(e.id))
    return newPending.length > 0 ? [...merged, ...newPending] : merged
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

  // Passed to DashboardHeader which owns the live tick for the running total.
  const runningEntry = useMemo(
    () => mergedBaseFiltered.find((e) => !e.endedAt) ?? null,
    [mergedBaseFiltered],
  )

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
    <div className="grid min-w-0 gap-6">
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
        completedTotalSeconds={completedTotals}
        runningEntry={runningEntry}
        formatTime={formatTime}
        trailing={
          <SelfExportDropdown currentMemberId={state.currentMemberId} />
        }
      />

      {/* Desktop: inline input section */}
      <div className="hidden min-w-0 sm:block">
        <InputSection {...inputSectionProps} />
      </div>

      {view === 'all' ? (
        <AllEntriesSection
          entries={filteredEntries}
          totalCount={allEntriesTotalCount}
          hasMore={allEntriesHasMore}
          loadingMore={allEntriesLoading}
          onLoadMore={() => void loadAllEntries(false)}
          activeFilterCount={activeFilterCount}
          clearFilters={clearFilters}
          filterControls={filterControls}
          clients={state.clients}
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
          onDuplicate={handleDuplicateEntry}
          onDelete={handleDeleteEntry}
        />
      ) : (
        <EntriesSection
          view={view}
          range={selectedRange}
          baseFiltered={mergedBaseFiltered}
          filteredEntries={filteredEntries}
          activeFilterCount={activeFilterCount}
          clearFilters={clearFilters}
          filterControls={filterControls}
          clients={state.clients}
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
          onDuplicate={handleDuplicateEntry}
          onDelete={handleDeleteEntry}
        />
      )}

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
        className={`fixed bottom-6 right-6 z-50 flex size-14 items-center justify-center rounded-full shadow-xl transition-colors sm:hidden ${
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

function SelfExportDropdown({ currentMemberId }: { currentMemberId: string }) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const todayStr = (() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  })()

  function openDialog() {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    setStartDate(`${y}-${m}-01`)
    setEndDate(`${y}-${m}-${d}`)
    setDialogOpen(true)
  }

  const handleExport = useCallback(
    async (sd: string, ed: string) => {
      setDialogOpen(false)
      setExporting(true)

      // Open synchronously before any await to avoid popup blockers.
      const win = window.open('', '_blank')
      if (!win) {
        gooeyToast.error('Pop-ups blocked', {
          description: 'Allow pop-ups for this site to open the report.',
        })
        setExporting(false)
        return
      }

      try {
        const report = await getMemberMonthlyReportFn({
          data: { memberId: currentMemberId, startDate: sd, endDate: ed },
        })

        const pad = (n: number) => String(n).padStart(2, '0')
        const fmtDate = (d: string) => {
          const date = new Date(d + 'T00:00:00')
          return date.toLocaleDateString('en-PH', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
        }
        const fmtHrs = (s: number) => {
          const h = Math.floor(s / 3600)
          const m = Math.floor((s % 3600) / 60)
          return `${h}h ${pad(m)}m`
        }
        const fmtShort = (iso: string) =>
          new Date(iso + 'T00:00:00').toLocaleDateString('en-PH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
        const dateRangeLabel = `${fmtShort(sd)} – ${fmtShort(ed)}`

        const totalHrs = fmtHrs(report.summary.totalSeconds)
        const billableHrs = fmtHrs(report.summary.billableSeconds)

        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>My Time Report - ${dateRangeLabel}</title>
  <style>
    @page { margin: 1.5cm; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #1a1a1a; }
    .header { text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #2563eb; }
    .header h1 { margin: 0; font-size: 20px; color: #2563eb; }
    .header p { margin: 4px 0 0; color: #666; font-size: 13px; }
    .summary-row { display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
    .summary-card { flex: 1; min-width: 120px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; }
    .summary-card .label { font-size: 10px; text-transform: uppercase; color: #666; font-weight: 600; letter-spacing: 0.5px; }
    .summary-card .value { font-size: 18px; font-weight: 800; margin-top: 4px; }
    .summary-card .value.primary { color: #2563eb; }
    .summary-card .value.green { color: #16a34a; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f3f4f6; text-align: left; padding: 8px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; border-bottom: 2px solid #e5e7eb; }
    td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.center { text-align: center; }
    .billable-badge { background: #dcfce7; color: #16a34a; padding: 1px 6px; border-radius: 4px; font-size: 9px; font-weight: 600; }
    .nonbillable-badge { background: #f3f4f6; color: #9ca3af; padding: 1px 6px; border-radius: 4px; font-size: 9px; font-weight: 600; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <h1>My Time Report</h1>
    <p>${report.memberName} &middot; ${report.memberEmail}</p>
    <p>${dateRangeLabel}</p>
  </div>

  <div class="summary-row">
    <div class="summary-card">
      <div class="label">Total Hours</div>
      <div class="value primary">${totalHrs}</div>
    </div>
    <div class="summary-card">
      <div class="label">Billable Hours</div>
      <div class="value green">${billableHrs}</div>
    </div>
    <div class="summary-card">
      <div class="label">Total Entries</div>
      <div class="value">${report.summary.entryCount}</div>
    </div>
    <div class="summary-card">
      <div class="label">Billable Amount</div>
      <div class="value green">${report.summary.totalBillableAmount > 0 ? formatCurrency(report.summary.totalBillableAmount, report.currency) : '—'}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Project / Client</th>
        <th>Tags</th>
        <th>Description</th>
        <th>Hours</th>
        <th>Rate</th>
        <th class="num">Amount</th>
        <th class="center">Type</th>
      </tr>
    </thead>
    <tbody>
      ${report.entries
        .map(
          (e) => `
        <tr>
          <td>${fmtDate(e.date)}</td>
          <td>${[e.projectName, e.clientName].filter(Boolean).join(' · ') || '—'}</td>
          <td>${e.tagNames.join(', ') || '—'}</td>
          <td>${e.description || 'Untitled'}</td>
          <td class="num">${fmtHrs(e.durationSeconds)}</td>
          <td class="num">${e.billable ? formatCurrency(e.effectiveRate, report.currency) : '—'}</td>
          <td class="num">${e.billableAmount != null ? formatCurrency(e.billableAmount, report.currency) : '—'}</td>
          <td class="center">${e.billable ? '<span class="billable-badge">Billable</span>' : '<span class="nonbillable-badge">Non-billable</span>'}</td>
        </tr>
      `,
        )
        .join('')}
    </tbody>
  </table>

  <div class="footer">
    Generated on ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })} &middot; Tickr
  </div>

  <script>window.print()</script>
</body>
</html>`

        win.document.write(html)
        win.document.close()
      } catch (err) {
        win.close()
        gooeyToast.error('Export failed', {
          description:
            err instanceof Error ? err.message : 'Could not generate report.',
        })
      } finally {
        setExporting(false)
      }
    },
    [currentMemberId],
  )

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={exporting}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-50"
      >
        {exporting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <FileText className="size-4" />
        )}
        Export my time
      </button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Export My Time Report</DialogTitle>
            <DialogDescription>
              Choose a date range to include in your personal time report.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold text-foreground">
                Start date
              </label>
              <input
                type="date"
                value={startDate}
                max={endDate || todayStr}
                onChange={(e) => setStartDate(e.target.value)}
                aria-label="Start date"
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold text-foreground">
                End date
              </label>
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                max={todayStr}
                onChange={(e) => setEndDate(e.target.value)}
                aria-label="End date"
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={() => handleExport(startDate, endDate)}
              disabled={!startDate || !endDate || startDate > endDate}
            >
              <FileText className="mr-2 size-4" />
              Generate PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
