import { ArrowLeft, FileText, PanelRightOpen } from 'lucide-react'
import type { ReportsPayload } from '#/lib/server/tracker/reports.server'
import type { DepartmentMemberDetail } from '#/lib/server/tracker/department-dashboard.server'
import type { TrackerState, TimeEntry } from '#/lib/time-tracker/types'
import { MemberExportButton } from '#/components/time-tracker/shared/MemberExportDialog'
import { BulkExportButton } from '#/components/time-tracker/shared/BulkExportDialog'
import { AnalyticsDateRange } from '#/components/time-tracker/analytics/AnalyticsDateRange'
import type { ReportsFilters } from './ReportsFilterBar'
import { ReportsFilterBar } from './ReportsFilterBar'
import { ReportsSummaryCards } from './ReportsSummaryCards'
import { ReportsMemberBreakdownTable } from './ReportsMemberBreakdown'
import {
  formatRange,
  toDateKey,
} from '#/components/time-tracker/analytics/analytics.utils'
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import type { SetStateAction } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import type { AnalyticsTimeEntryRow } from '#/lib/server/tracker/analytics.server'
import {
  bulkDeleteWorkspaceMemberEntriesFn,
  deleteWorkspaceMemberEntryFn,
  updateWorkspaceMemberEntryFn,
} from '#/lib/server/tracker'
import { gooeyToast } from '#/lib/toast'
import { dateTimeLocalValue } from '#/lib/time-tracker/store'
import { confirmTimeEntryOverlap } from '#/lib/time-tracker/overlap-confirmation'
import { trackerKeys } from '#/lib/time-tracker/query-keys'
import { ConfirmDialog } from '../dashboard/ConfirmDialog'
import { EditEntryDrawer } from '../dashboard/EditEntryDrawer'
import type { DraftEntry } from '../dashboard/utils'
import { emptyDraft, toEntryPayload } from '../dashboard/utils'
import { useTaskSyncPublisher } from '../TaskSyncCoordinator'

export type ReportsQuery = {
  startDate: string
  endDate: string
}

type ReportsChartsComponent = (props: {
  reports: ReportsPayload
}) => React.ReactNode

type ReportsScreenProps = {
  reports: ReportsPayload
  state: TrackerState
  detail?: DepartmentMemberDetail
  singleMemberId?: string | null
  canEditEntries?: boolean
  currentFilters: ReportsFilters
  onChangeQuery: (updates: Partial<ReportsQuery & ReportsFilters>) => void
}

export function ReportsScreen(props: ReportsScreenProps) {
  const { currentFilters, detail, singleMemberId, canEditEntries } = props

  if (singleMemberId && detail) {
    return (
      <MemberDetailView
        detail={detail}
        state={props.state}
        canEditEntries={canEditEntries ?? false}
        onChangeQuery={props.onChangeQuery}
      />
    )
  }
  const draftKey = [
    currentFilters.departmentId,
    currentFilters.clientId,
    currentFilters.projectId,
    currentFilters.taskId,
    currentFilters.tagIds,
    currentFilters.memberIds,
    currentFilters.status,
    currentFilters.description,
    currentFilters.billable,
  ].join('|')

  return <ReportsScreenContent key={draftKey} {...props} />
}

function ReportsScreenContent({
  reports,
  state,
  currentFilters,
  onChangeQuery,
}: ReportsScreenProps) {
  const [draftFilters, setDraftFilters] = useReducer(
    (
      current: ReportsFilters,
      action: SetStateAction<ReportsFilters>,
    ): ReportsFilters =>
      typeof action === 'function' ? action(current) : action,
    currentFilters,
  )

  const selectedMemberIds = (currentFilters.memberIds ?? '')
    .split(',')
    .filter(Boolean)
  const singleSelectedMemberId =
    selectedMemberIds.length === 1 ? selectedMemberIds[0] : null

  const handleFilterChange = useCallback(
    (updates: Partial<ReportsFilters>) =>
      setDraftFilters((prev: ReportsFilters) => ({
        ...prev,
        ...updates,
        page: undefined,
      })),
    [],
  )

  const handleSearch = useCallback(
    () =>
      setDraftFilters((draft: ReportsFilters) => {
        onChangeQuery({
          departmentId: draft.departmentId,
          clientId: draft.clientId,
          projectId: draft.projectId,
          taskId: draft.taskId,
          tagIds: draft.tagIds,
          memberIds: draft.memberIds,
          status: draft.status,
          description: draft.description,
          billable: draft.billable,
        })
        return draft
      }),
    [onChangeQuery],
  )

  const handleClearFilters = useCallback(() => {
    const cleared: ReportsFilters = {
      departmentId: undefined,
      clientId: undefined,
      projectId: undefined,
      taskId: undefined,
      tagIds: undefined,
      memberIds: undefined,
      status: undefined,
      description: undefined,
      billable: undefined,
      page: undefined,
    }
    setDraftFilters(cleared)
    onChangeQuery(cleared)
  }, [onChangeQuery])

  return (
    <div className="mx-auto grid w-full max-w-7xl min-w-0 gap-4 sm:gap-5">
      <section className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-primary">
              <FileText className="size-3.5" />
              Reports
            </div>
            <h1 className="m-0 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
              Time reports
            </h1>
            <p className="m-0 mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Filter and export detailed time reports across your workspace.
            </p>
            <p className="m-0 mt-3 text-sm font-bold leading-6 text-foreground">
              {formatRange(reports.startDate, reports.endDate)}
            </p>

            <WeeklyPresets
              currentStartDate={reports.startDate}
              currentEndDate={reports.endDate}
              onChangeRange={(range: { startDate: string; endDate: string }) =>
                onChangeQuery({ ...range, page: undefined })
              }
            />
          </div>

          <div className="flex min-w-0 flex-col gap-3 sm:items-start xl:items-end">
            <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-start xl:justify-end">
              <AnalyticsDateRange
                range={{
                  startDate: reports.startDate,
                  endDate: reports.endDate,
                }}
                onChangeRange={(range: {
                  startDate: string
                  endDate: string
                }) =>
                  onChangeQuery({
                    ...range,
                    page: undefined,
                  })
                }
              />
              {singleSelectedMemberId && (
                <div className="min-w-0 [&>button]:w-full sm:[&>button]:w-auto">
                  <MemberExportButton
                    memberId={singleSelectedMemberId}
                    defaultStartDate={reports.startDate}
                    defaultEndDate={reports.endDate}
                  />
                </div>
              )}
              <div className="min-w-0 [&>button]:w-full sm:[&>button]:w-auto">
                <BulkExportButton
                  state={state}
                  defaultStartDate={reports.startDate}
                  defaultEndDate={reports.endDate}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="no-print">
        <ReportsFilterBar
          state={state}
          filters={draftFilters}
          selectedMemberId={singleSelectedMemberId ?? undefined}
          onChange={handleFilterChange}
          onSearch={handleSearch}
          onClear={handleClearFilters}
        />
      </div>

      <ReportsSummaryCards
        summary={reports.summary}
        currency={reports.currency}
      />

      <ClientReportsCharts reports={reports} />

      <ReportsMemberBreakdownTable
        members={reports.memberBreakdown}
        currency={reports.currency}
        onViewMember={(memberId: string) =>
          onChangeQuery({ memberIds: memberId, page: undefined })
        }
      />

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { size: landscape; margin: 1cm; }
        }
      `}</style>
    </div>
  )
}

function ClientReportsCharts({
  reports,
}: {
  reports: ReportsPayload
}): React.ReactNode {
  const [Charts, setCharts] = useState<ReportsChartsComponent | null>(null)

  useEffect(() => {
    let mounted = true
    import('./ReportsCharts').then(
      (module: { ReportsCharts: ReportsChartsComponent }) => {
        if (mounted) setCharts(() => module.ReportsCharts)
      },
    )
    return () => {
      mounted = false
    }
  }, [])

  if (!Charts) {
    return <div className="h-[320px] rounded-lg border border-border bg-card" />
  }

  return <Charts reports={reports} />
}

// ── Member Detail View ──────────────────────────────────────────────────────

type ScreenState = {
  editingEntry: TimeEntry | null
  editingDraft: DraftEntry
  entryPatches: Record<string, AnalyticsTimeEntryRow>
  deletedEntryIds: Record<string, boolean>
  deleteTarget: AnalyticsTimeEntryRow | null
  bulkDeleteTargets: AnalyticsTimeEntryRow[]
  savePending: boolean
  deletePending: boolean
}

type ScreenAction =
  | { type: 'startEdit'; entry: TimeEntry; draft: DraftEntry }
  | { type: 'closeEdit' }
  | { type: 'setEditingDraft'; update: SetStateAction<DraftEntry> }
  | { type: 'patchEntry'; entry: AnalyticsTimeEntryRow }
  | { type: 'openDelete'; entry: AnalyticsTimeEntryRow }
  | { type: 'openBulkDelete'; entries: AnalyticsTimeEntryRow[] }
  | { type: 'closeDelete' }
  | { type: 'deleteEntries'; entryIds: string[] }
  | { type: 'setSavePending'; pending: boolean }
  | { type: 'setDeletePending'; pending: boolean }

function screenReducer(
  current: ScreenState,
  action: ScreenAction,
): ScreenState {
  switch (action.type) {
    case 'startEdit':
      return {
        ...current,
        editingEntry: action.entry,
        editingDraft: action.draft,
      }
    case 'closeEdit':
      return { ...current, editingEntry: null }
    case 'setEditingDraft':
      return {
        ...current,
        editingDraft:
          typeof action.update === 'function'
            ? action.update(current.editingDraft)
            : action.update,
      }
    case 'patchEntry':
      return {
        ...current,
        entryPatches: {
          ...current.entryPatches,
          [action.entry.id]: action.entry,
        },
      }
    case 'openDelete':
      return { ...current, deleteTarget: action.entry, bulkDeleteTargets: [] }
    case 'openBulkDelete':
      return {
        ...current,
        deleteTarget: null,
        bulkDeleteTargets: action.entries,
      }
    case 'closeDelete':
      return { ...current, deleteTarget: null, bulkDeleteTargets: [] }
    case 'deleteEntries': {
      const deletedEntryIds = { ...current.deletedEntryIds }
      for (const entryId of action.entryIds) {
        deletedEntryIds[entryId] = true
      }
      return {
        ...current,
        deleteTarget: null,
        bulkDeleteTargets: [],
        editingEntry:
          current.editingEntry &&
          action.entryIds.includes(current.editingEntry.id)
            ? null
            : current.editingEntry,
        deletedEntryIds,
      }
    }
    case 'setSavePending':
      return { ...current, savePending: action.pending }
    case 'setDeletePending':
      return { ...current, deletePending: action.pending }
  }
}

function createInitialScreenState(): ScreenState {
  return {
    editingEntry: null,
    editingDraft: emptyDraft(),
    entryPatches: {},
    deletedEntryIds: {},
    deleteTarget: null,
    bulkDeleteTargets: [],
    savePending: false,
    deletePending: false,
  }
}

function buildUpdatedAnalyticsEntry(
  entry: AnalyticsTimeEntryRow,
  draft: DraftEntry,
  state: TrackerState,
  dateFormatter: Intl.DateTimeFormat,
): AnalyticsTimeEntryRow {
  const payload = toEntryPayload(draft)
  const project = state.projects.find((item) => item.id === payload.projectId)
  const client = project
    ? state.clients.find((item) => item.id === project.clientId)
    : null
  const tagNames = payload.tagIds.flatMap((tagId) => {
    const tag = state.tags.find((item) => item.id === tagId)
    return tag ? [tag.name] : []
  })
  const effectiveRate = payload.billable ? entry.effectiveRate : null

  return {
    ...entry,
    date: dateFormatter.format(new Date(payload.startedAt)),
    description: payload.description,
    projectId: payload.projectId,
    taskId: payload.taskId,
    projectName: project?.name ?? null,
    clientName: client?.name ?? null,
    tagIds: payload.tagIds,
    tagNames,
    startedAt: payload.startedAt,
    endedAt: payload.endedAt,
    durationSeconds: payload.durationSeconds,
    billable: payload.billable,
    notes: payload.notes,
    billableAmount:
      payload.billable && effectiveRate !== null
        ? (payload.durationSeconds / 3600) * effectiveRate
        : null,
    effectiveRate,
  }
}

function MemberDetailView({
  detail,
  state,
  canEditEntries,
  onChangeQuery,
}: {
  detail: DepartmentMemberDetail
  state: TrackerState
  canEditEntries: boolean
  onChangeQuery: (updates: Partial<ReportsQuery & ReportsFilters>) => void
}) {
  const page = detail.page
  const { activity } = detail
  const [activitySheetOpen, setActivitySheetOpen] = useState(false)

  const router = useRouter()
  const queryClient = useQueryClient()
  const publishTaskChange = useTaskSyncPublisher()
  const [screenState, dispatch] = useReducer(
    screenReducer,
    undefined,
    createInitialScreenState,
  )
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: detail.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
    [detail.timezone],
  )

  const tableData = useMemo(() => {
    const entries: AnalyticsTimeEntryRow[] = []
    let deletedVisibleCount = 0

    for (const entry of detail.entries) {
      if (screenState.deletedEntryIds[entry.id]) {
        deletedVisibleCount += 1
        continue
      }
      entries.push(screenState.entryPatches[entry.id] ?? entry)
    }

    return {
      entries,
      total: Math.max(0, detail.entriesTotal - deletedVisibleCount),
    }
  }, [
    detail.entries,
    detail.entriesTotal,
    screenState.deletedEntryIds,
    screenState.entryPatches,
  ])

  const refreshAnalyticsData = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: trackerKeys.departmentMemberDetails,
    })
    await router.invalidate()
  }, [queryClient, router])

  function setEditingDraft(update: SetStateAction<DraftEntry>) {
    dispatch({ type: 'setEditingDraft', update })
  }

  function openEdit(entry: AnalyticsTimeEntryRow) {
    const project = state.projects.find((p) => p.id === entry.projectId)
    dispatch({
      type: 'startEdit',
      entry: {
        id: entry.id,
        workspaceMemberId: entry.workspaceMemberId,
        description: entry.description,
        projectId: entry.projectId,
        taskId: entry.taskId,
        tagIds: entry.tagIds,
        billable: entry.billable,
        startedAt: entry.startedAt,
        endedAt: entry.endedAt,
        durationSeconds: entry.durationSeconds,
        notes: entry.notes,
        entrySource: null,
      },
      draft: {
        description: entry.description,
        clientId: project?.clientId ?? '',
        projectId: entry.projectId,
        taskId: entry.taskId ?? '',
        tagIds: entry.tagIds,
        billable: entry.billable,
        startedAt: dateTimeLocalValue(new Date(entry.startedAt)),
        endedAt: dateTimeLocalValue(new Date(entry.endedAt ?? Date.now())),
        notes: entry.notes,
      },
    })
  }

  async function saveEdit() {
    const { editingDraft, editingEntry } = screenState
    if (!editingEntry || !editingDraft.description.trim()) return

    dispatch({ type: 'setSavePending', pending: true })
    try {
      const confirmed = await confirmTimeEntryOverlap({
        memberId: editingEntry.workspaceMemberId,
        excludeEntryId: editingEntry.id,
        startedAt: new Date(editingDraft.startedAt).toISOString(),
        endedAt: new Date(editingDraft.endedAt).toISOString(),
      })
      if (!confirmed) return
      await updateWorkspaceMemberEntryFn({
        data: {
          id: editingEntry.id,
          ...toEntryPayload(editingDraft),
        },
      })
      publishTaskChange()
      const currentEntry = tableData.entries.find(
        (entry) => entry.id === editingEntry.id,
      )
      if (currentEntry) {
        dispatch({
          type: 'patchEntry',
          entry: buildUpdatedAnalyticsEntry(
            currentEntry,
            editingDraft,
            state,
            dateFormatter,
          ),
        })
      }
      dispatch({ type: 'closeEdit' })
      await refreshAnalyticsData()
      gooeyToast.success('Entry updated')
    } catch (err) {
      gooeyToast.error('Action failed', {
        description:
          err instanceof Error ? err.message : 'Something went wrong.',
      })
    } finally {
      dispatch({ type: 'setSavePending', pending: false })
    }
  }

  async function deleteEntry() {
    const target = screenState.deleteTarget
    if (!target) return

    dispatch({ type: 'setDeletePending', pending: true })
    try {
      await deleteWorkspaceMemberEntryFn({ data: { id: target.id } })
      publishTaskChange()
      dispatch({ type: 'deleteEntries', entryIds: [target.id] })
      await refreshAnalyticsData()
      gooeyToast.success('Entry deleted')
    } catch (err) {
      gooeyToast.error('Could not delete entry', {
        description:
          err instanceof Error ? err.message : 'Something went wrong.',
      })
    } finally {
      dispatch({ type: 'setDeletePending', pending: false })
    }
  }

  async function bulkDeleteEntries() {
    const targets = screenState.bulkDeleteTargets
    if (targets.length === 0) return

    const ids = targets.map((entry) => entry.id)
    dispatch({ type: 'setDeletePending', pending: true })
    try {
      await bulkDeleteWorkspaceMemberEntriesFn({ data: { ids } })
      publishTaskChange()
      dispatch({ type: 'deleteEntries', entryIds: ids })
      await refreshAnalyticsData()
      gooeyToast.success(`${ids.length} entries deleted`)
    } catch (err) {
      gooeyToast.error('Could not delete selected entries', {
        description:
          err instanceof Error ? err.message : 'Something went wrong.',
      })
    } finally {
      dispatch({ type: 'setDeletePending', pending: false })
    }
  }

  const deleteDescription =
    screenState.deleteTarget?.description.trim() ||
    screenState.deleteTarget?.projectName ||
    screenState.deleteTarget?.date ||
    'this task'
  const bulkDeleteCount = screenState.bulkDeleteTargets.length

  return (
    <div className="mx-auto grid w-full max-w-7xl min-w-0 gap-4 sm:gap-5">
      <button
        type="button"
        onClick={() => onChangeQuery({ memberIds: undefined, page: undefined })}
        className="inline-flex h-9 w-fit items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
      >
        <ArrowLeft className="size-4" />
        Back to reports
      </button>

      <section className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p
              className="m-0 text-sm font-semibold"
              style={{
                color: activity.member.departmentColor ?? undefined,
              }}
            >
              Member Reports
            </p>
            <h1 className="m-0 mt-1 truncate text-2xl font-bold text-foreground">
              {activity.member.name}
            </h1>
            <p className="m-0 mt-1 truncate text-sm text-muted-foreground">
              {activity.member.email}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MemberExportButton
              memberId={activity.member.id}
              memberName={activity.member.name}
              defaultStartDate={detail.startDate ?? undefined}
              defaultEndDate={detail.endDate ?? undefined}
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatPill
            label="Today"
            value={formatHoursLabel(activity.today.totalSeconds)}
          />
          <StatPill
            label="This Month"
            value={formatHoursLabel(
              activity.today.completedSeconds + activity.today.activeSeconds,
            )}
          />
          <StatPill
            label="Total Tracked"
            value={formatHoursLabel(detail.summary.totalSeconds)}
          />
          <StatPill label="Entries" value={String(detail.entriesTotal)} />
        </div>

        <CurrentActivityPanel
          activity={activity}
          onOpen={() => setActivitySheetOpen(true)}
        />
      </section>

      <EntriesTableWrapper
        entries={tableData.entries}
        entriesTotal={tableData.total}
        page={page}
        onPageChange={() => {}}
        timezone={detail.timezone}
        onEditEntry={canEditEntries ? openEdit : undefined}
        onDeleteEntry={
          canEditEntries
            ? (entry: AnalyticsTimeEntryRow) =>
                dispatch({ type: 'openDelete', entry })
            : undefined
        }
        onBulkDeleteEntries={
          canEditEntries
            ? (entries: AnalyticsTimeEntryRow[]) =>
                dispatch({ type: 'openBulkDelete', entries })
            : undefined
        }
      />

      {activitySheetOpen && (
        <ActivitySheetWrapper
          memberId={activity.member.id}
          onClose={() => setActivitySheetOpen(false)}
        />
      )}

      <EditEntryDrawer
        open={!!screenState.editingEntry}
        onOpenChange={(open: boolean) => {
          if (!open) dispatch({ type: 'closeEdit' })
        }}
        entry={screenState.editingEntry}
        editingDraft={screenState.editingDraft}
        setEditingDraft={setEditingDraft}
        clients={state.clients}
        projects={state.projects}
        projectTasks={state.projectTasks}
        tags={state.tags}
        canManageCatalog={false}
        pending={screenState.savePending}
        onSave={() => {
          void saveEdit()
        }}
        onCancel={() => dispatch({ type: 'closeEdit' })}
      />

      <ConfirmDialog
        open={!!screenState.deleteTarget}
        onOpenChange={() => dispatch({ type: 'closeDelete' })}
        title="Delete task"
        description={`Delete "${deleteDescription}"?`}
        pending={screenState.deletePending}
        onConfirm={() => {
          void deleteEntry()
        }}
      />

      <ConfirmDialog
        open={bulkDeleteCount > 0}
        onOpenChange={() => dispatch({ type: 'closeDelete' })}
        title="Delete selected tasks"
        description={`Delete ${bulkDeleteCount} selected time ${bulkDeleteCount === 1 ? 'entry' : 'entries'}?`}
        pending={screenState.deletePending}
        onConfirm={() => {
          void bulkDeleteEntries()
        }}
      />

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { size: landscape; margin: 1cm; }
        }
      `}</style>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatHoursLabel(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0 && m === 0) return '—'
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="m-0 mt-0.5 text-lg font-bold text-foreground">{value}</p>
    </div>
  )
}

function CurrentActivityPanel({
  activity,
  onOpen,
}: {
  activity: DepartmentMemberDetail['activity']
  onOpen: () => void
}) {
  const isActive = !!activity.activeEntry

  return (
    <div className="mt-4 min-w-0 rounded-lg border bg-card p-3 sm:p-4">
      <div className="flex items-center gap-3">
        <span
          className={`size-2.5 shrink-0 rounded-full ${
            isActive
              ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]'
              : 'bg-muted-foreground/30'
          }`}
        />
        <p className="m-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {isActive ? 'Currently tracking' : 'Not tracking'}
        </p>

        <button
          type="button"
          onClick={onOpen}
          className="ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground transition-all hover:brightness-110"
        >
          <PanelRightOpen className="size-3.5" />
          View activity
        </button>
      </div>

      {isActive && activity.activeEntry && (
        <p className="m-0 mt-2 text-sm text-foreground">
          {activity.activeEntry.description || 'No description'}
        </p>
      )}
    </div>
  )
}

function ActivitySheetWrapper({
  memberId,
  onClose,
}: {
  memberId: string
  onClose: () => void
}): React.ReactNode {
  const [Sheet, setSheet] = useState<
    | ((props: {
        memberId: string | null
        onClose: () => void
      }) => React.ReactNode)
    | null
  >(null)

  useEffect(() => {
    let mounted = true
    import('../analytics/department/DepartmentMemberActivitySheet').then(
      (module: {
        DepartmentMemberActivitySheet: (props: {
          memberId: string | null
          onClose: () => void
        }) => React.ReactNode
      }) => {
        if (mounted) setSheet(() => module.DepartmentMemberActivitySheet)
      },
    )
    return () => {
      mounted = false
    }
  }, [])

  if (!Sheet) return null

  return <Sheet memberId={memberId} onClose={onClose} />
}

type TableProps = {
  entries: DepartmentMemberDetail['entries']
  entriesTotal: number
  page: number
  onPageChange: (page: number) => void
  timezone: string
  onEditEntry?: (entry: AnalyticsTimeEntryRow) => void
  onDeleteEntry?: (entry: AnalyticsTimeEntryRow) => void
  onBulkDeleteEntries?: (entries: AnalyticsTimeEntryRow[]) => void
}

function EntriesTableWrapper(props: TableProps): React.ReactNode {
  const [Table, setTable] = useState<
    ((p: TableProps) => React.ReactNode) | null
  >(null)

  useEffect(() => {
    let mounted = true
    import('../analytics/AnalyticsEntriesTable').then(
      (module: {
        AnalyticsEntriesTable: (p: TableProps) => React.ReactNode
      }) => {
        if (mounted) setTable(() => module.AnalyticsEntriesTable)
      },
    )
    return () => {
      mounted = false
    }
  }, [])

  if (!Table) {
    return <div className="h-[200px] rounded-lg border border-border bg-card" />
  }

  return <Table {...props} />
}

function getWeekRange(today: Date): { startDate: string; endDate: string } {
  const day = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
  return { startDate: toDateKey(monday), endDate: toDateKey(today) }
}

function getLastWeekRange(): { startDate: string; endDate: string } {
  const today = new Date()
  const day = today.getDay()
  const thisMonday = new Date(today)
  thisMonday.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
  const lastMonday = new Date(thisMonday)
  lastMonday.setDate(thisMonday.getDate() - 7)
  const lastSunday = new Date(thisMonday)
  lastSunday.setDate(thisMonday.getDate() - 1)
  return { startDate: toDateKey(lastMonday), endDate: toDateKey(lastSunday) }
}

function getMonthRange(): { startDate: string; endDate: string } {
  const today = new Date()
  const first = new Date(today.getFullYear(), today.getMonth(), 1)
  return { startDate: toDateKey(first), endDate: toDateKey(today) }
}

function WeeklyPresets({
  currentStartDate,
  currentEndDate,
  onChangeRange,
}: {
  currentStartDate: string
  currentEndDate: string
  onChangeRange: (range: { startDate: string; endDate: string }) => void
}) {
  const presets = useMemo(
    () => [
      { label: 'This Week', ...getWeekRange(new Date()) },
      { label: 'Last Week', ...getLastWeekRange() },
      { label: 'This Month', ...getMonthRange() },
    ],
    [],
  )

  const activeLabel =
    presets.find(
      (p) => p.startDate === currentStartDate && p.endDate === currentEndDate,
    )?.label ?? null

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {presets.map((preset) => (
        <button
          key={preset.label}
          type="button"
          onClick={() =>
            onChangeRange({
              startDate: preset.startDate,
              endDate: preset.endDate,
            })
          }
          className={`inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold transition-colors ${
            activeLabel === preset.label
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
          }`}
        >
          {preset.label}
        </button>
      ))}
    </div>
  )
}
