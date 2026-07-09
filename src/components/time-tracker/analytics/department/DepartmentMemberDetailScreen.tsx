import { useCallback, useMemo, useReducer } from 'react'
import type { SetStateAction } from 'react'
import { ArrowLeft, CalendarDays, PanelRightOpen, Timer, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import type { DepartmentMemberDetail } from '#/lib/server/tracker/department-dashboard.server'
import type { AnalyticsTimeEntryRow } from '#/lib/server/tracker/analytics.server'
import {
  bulkDeleteWorkspaceMemberEntriesFn,
  deleteWorkspaceMemberEntryFn,
  updateWorkspaceMemberEntryFn,
} from '#/lib/server/tracker'
import { gooeyToast } from '#/lib/toast'
import { dateTimeLocalValue, formatDuration } from '#/lib/time-tracker/store'
import { trackerKeys } from '#/lib/time-tracker/query-keys'
import type { TimeEntry, TrackerState } from '#/lib/time-tracker/types'
import { confirmTimeEntryOverlap } from '#/lib/time-tracker/overlap-confirmation'
import { ConfirmDialog } from '../../dashboard/ConfirmDialog'
import { EditEntryDrawer } from '../../dashboard/EditEntryDrawer'
import type { DraftEntry } from '../../dashboard/utils'
import { emptyDraft, toEntryPayload } from '../../dashboard/utils'
import { MemberExportButton } from '../../shared/MemberExportDialog'
import { AnalyticsDateRange } from '../AnalyticsDateRange'
import { AnalyticsEntriesTable } from '../AnalyticsEntriesTable'
import { DepartmentMemberActivitySheet } from './DepartmentMemberActivitySheet'

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

type ScreenState = {
  activitySheetOpen: boolean
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
  | { type: 'openActivitySheet' }
  | { type: 'closeActivitySheet' }
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
    case 'openActivitySheet':
      return { ...current, activitySheetOpen: true }
    case 'closeActivitySheet':
      return { ...current, activitySheetOpen: false }
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
    activitySheetOpen: false,
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

export function DepartmentMemberDetailScreen({
  detail,
  state,
  canEditEntries,
  onBack,
  onViewCalendar,
  onChangeRange,
  onClearRange,
  onChangePage,
}: {
  detail: DepartmentMemberDetail
  state: TrackerState
  canEditEntries: boolean
  onBack: () => void
  onViewCalendar: () => void
  onChangeRange: (
    startDate: string | undefined,
    endDate: string | undefined,
  ) => void
  onClearRange: () => void
  onChangePage: (page: number) => void
}) {
  const router = useRouter()
  const queryClient = useQueryClient()
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

  const deleteDescription =
    screenState.deleteTarget?.description.trim() ||
    screenState.deleteTarget?.projectName ||
    screenState.deleteTarget?.date ||
    'this task'
  const bulkDeleteCount = screenState.bulkDeleteTargets.length

  const refreshAnalyticsData = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: trackerKeys.departmentMemberDetails,
      }),
      queryClient.invalidateQueries({
        queryKey: ['department-dashboard'],
      }),
    ])
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
      // This screen renders route loader data rather than a useQuery
      // subscription. Wait for the loader to rerun so summary cards and
      // pagination totals follow the updated row.
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

  return (
    <div className="space-y-6">
      <MemberDetailHeader
        detail={detail}
        onBack={onBack}
        onViewCalendar={onViewCalendar}
      />

      <MemberSummaryCards summary={detail.summary} />

      <MemberFilterBar
        detail={detail}
        onChangeRange={onChangeRange}
        onClearRange={onClearRange}
      />

      <div className="grid min-w-0 gap-3">
        <CurrentActivityPanel
          activity={detail.activity}
          onOpen={() => dispatch({ type: 'openActivitySheet' })}
        />

        <AnalyticsEntriesTable
          entries={tableData.entries}
          entriesTotal={tableData.total}
          page={detail.page}
          onPageChange={onChangePage}
          timezone={detail.timezone}
          onEditEntry={canEditEntries ? openEdit : undefined}
          onDeleteEntry={
            canEditEntries
              ? (entry) => dispatch({ type: 'openDelete', entry })
              : undefined
          }
          onBulkDeleteEntries={
            canEditEntries
              ? (entries) => dispatch({ type: 'openBulkDelete', entries })
              : undefined
          }
        />
      </div>

      <DepartmentMemberActivitySheet
        memberId={
          screenState.activitySheetOpen ? detail.activity.member.id : null
        }
        onClose={() => dispatch({ type: 'closeActivitySheet' })}
      />

      <EditEntryDrawer
        open={!!screenState.editingEntry}
        onOpenChange={(open) => {
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
        onSave={saveEdit}
        onCancel={() => dispatch({ type: 'closeEdit' })}
      />

      <DeleteEntryConfirmDialog
        open={!!screenState.deleteTarget}
        title="Delete task"
        description={`Delete "${deleteDescription}"? This permanently removes the time entry and updates this member's analytics.`}
        pending={screenState.deletePending}
        onClose={() => dispatch({ type: 'closeDelete' })}
        onConfirm={() => {
          void deleteEntry()
        }}
      />

      <DeleteEntryConfirmDialog
        open={bulkDeleteCount > 0}
        title="Delete selected tasks"
        description={`Delete ${bulkDeleteCount} selected time ${
          bulkDeleteCount === 1 ? 'entry' : 'entries'
        }? This permanently removes them and updates this member's analytics.`}
        pending={screenState.deletePending}
        onClose={() => dispatch({ type: 'closeDelete' })}
        onConfirm={() => {
          void bulkDeleteEntries()
        }}
      />
    </div>
  )
}

function MemberFilterBar({
  detail,
  onChangeRange,
  onClearRange,
}: {
  detail: DepartmentMemberDetail
  onChangeRange: (
    startDate: string | undefined,
    endDate: string | undefined,
  ) => void
  onClearRange: () => void
}) {
  const hasRange = detail.startDate && detail.endDate

  function applyDefaultRange() {
    const end = new Date()
    const start = new Date(end)
    start.setDate(end.getDate() - 29)
    const toKey = (d: Date) => d.toISOString().slice(0, 10)
    onChangeRange(toKey(start), toKey(end))
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasRange ? (
        <>
          <AnalyticsDateRange
            range={{ startDate: detail.startDate!, endDate: detail.endDate! }}
            onChangeRange={(range) =>
              onChangeRange(range.startDate, range.endDate)
            }
          />
          <button
            type="button"
            onClick={onClearRange}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" />
            Clear filter
          </button>
        </>
      ) : (
        <>
          <span className="text-xs font-semibold text-muted-foreground">
            Showing all records
          </span>
          <button
            type="button"
            onClick={applyDefaultRange}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <CalendarDays className="size-3.5" />
            Filter by date
          </button>
        </>
      )}
    </div>
  )
}

function MemberDetailHeader({
  detail,
  onBack,
  onViewCalendar,
}: {
  detail: DepartmentMemberDetail
  onBack: () => void
  onViewCalendar: () => void
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
        <p
          className="m-0 text-sm font-semibold"
          style={{
            color: detail.activity.member.departmentColor ?? undefined,
          }}
        >
          Member Analytics
        </p>
        <h1 className="m-0 mt-1 truncate text-2xl font-bold text-foreground">
          {detail.activity.member.name}
        </h1>
        <p className="m-0 mt-1 truncate text-sm text-muted-foreground">
          {detail.activity.member.email}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MemberExportButton
          memberId={detail.activity.member.id}
          memberName={detail.activity.member.name}
          defaultStartDate={detail.startDate ?? undefined}
          defaultEndDate={detail.endDate ?? undefined}
        />
        <button
          type="button"
          onClick={onViewCalendar}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
        >
          <CalendarDays className="size-4" />
          Calendar
        </button>
      </div>
    </div>
  )
}

function DeleteEntryConfirmDialog({
  open,
  title,
  description,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean
  title: string
  description: string
  pending: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
      title={title}
      description={description}
      confirmLabel="Delete"
      variant="destructive"
      pending={pending}
      onConfirm={onConfirm}
    />
  )
}

function CurrentActivityPanel({
  activity,
  onOpen,
}: {
  activity: DepartmentMemberDetail['activity']
  onOpen: () => void
}) {
  const activeLabel = activity.activeEntry
    ? `Working now: ${
        activity.activeEntry.taskName ?? activity.activeEntry.description
      }`
    : 'Open as a sheet without changing the entries table'

  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <Timer className="size-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="m-0 truncate text-sm font-bold text-foreground">
            Current Activity
          </p>
          <p className="m-0 truncate text-xs text-muted-foreground">
            {activeLabel}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent sm:w-auto"
      >
        <PanelRightOpen className="size-3.5" />
        Open
      </button>
    </div>
  )
}

function MemberSummaryCards({
  summary,
}: {
  summary: DepartmentMemberDetail['summary']
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <MemberTimeSummary
        label="Tracked hours"
        value={formatDuration(summary.totalSeconds)}
        helper="Sum of all entries"
      />
      <MemberTimeSummary
        label="Actual hours"
        value={formatDuration(summary.actualSeconds)}
        helper="Overlap counted once"
      />
      <MemberTimeSummary
        label="Overlap"
        value={formatDuration(summary.overlapSeconds)}
        helper={
          summary.overlapSeconds > 0
            ? 'Concurrent entries'
            : 'No overlapping time'
        }
      />
    </div>
  )
}

function MemberTimeSummary({
  label,
  value,
  helper,
}: {
  label: string
  value: string
  helper: string
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <p className="m-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="m-0 mt-1 font-mono text-xl font-black text-foreground">
        {value}
      </p>
      <p className="m-0 mt-1 text-xs text-muted-foreground">{helper}</p>
    </section>
  )
}
