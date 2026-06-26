import { useMemo, useReducer } from 'react'
import type { SetStateAction } from 'react'
import { ArrowLeft, PanelRightOpen, Timer } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import type { DepartmentMemberDetail } from '#/lib/server/tracker/department-dashboard.server'
import type { AnalyticsTimeEntryRow } from '#/lib/server/tracker/analytics.server'
import { updateWorkspaceMemberEntryFn } from '#/lib/server/tracker'
import { gooeyToast } from '#/lib/toast'
import { dateTimeLocalValue, formatDuration } from '#/lib/time-tracker/store'
import { trackerKeys } from '#/lib/time-tracker/query-keys'
import type { TimeEntry, TrackerState } from '#/lib/time-tracker/types'
import { confirmTimeEntryOverlap } from '#/lib/time-tracker/overlap-confirmation'
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
  savePending: boolean
}

type ScreenAction =
  | { type: 'openActivitySheet' }
  | { type: 'closeActivitySheet' }
  | { type: 'startEdit'; entry: TimeEntry; draft: DraftEntry }
  | { type: 'closeEdit' }
  | { type: 'setEditingDraft'; update: SetStateAction<DraftEntry> }
  | { type: 'patchEntry'; entry: AnalyticsTimeEntryRow }
  | { type: 'setSavePending'; pending: boolean }

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
    case 'setSavePending':
      return { ...current, savePending: action.pending }
  }
}

function createInitialScreenState(): ScreenState {
  return {
    activitySheetOpen: false,
    editingEntry: null,
    editingDraft: emptyDraft(),
    entryPatches: {},
    savePending: false,
  }
}

export function DepartmentMemberDetailScreen({
  detail,
  state,
  canEditEntries,
  onBack,
  onChangeRange,
  onChangePage,
}: {
  detail: DepartmentMemberDetail
  state: TrackerState
  canEditEntries: boolean
  onBack: () => void
  onChangeRange: (startDate: string, endDate: string) => void
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
  const tableEntries = useMemo(
    () =>
      detail.entries.map(
        (entry) => screenState.entryPatches[entry.id] ?? entry,
      ),
    [detail.entries, screenState.entryPatches],
  )

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
      const currentEntry = tableEntries.find(
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
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: trackerKeys.departmentMemberDetails,
        }),
        queryClient.invalidateQueries({
          queryKey: ['department-dashboard'],
        }),
      ])
      // This screen renders route loader data rather than a useQuery
      // subscription. Wait for the loader to rerun so summary cards and
      // pagination totals follow the updated row.
      await router.invalidate()
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

  return (
    <div className="space-y-6">
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

        <div className="flex flex-col gap-2 sm:items-end">
          <AnalyticsDateRange
            range={{ startDate: detail.startDate, endDate: detail.endDate }}
            onChangeRange={(range) =>
              onChangeRange(range.startDate, range.endDate)
            }
          />
          <MemberExportButton
            memberId={detail.activity.member.id}
            memberName={detail.activity.member.name}
            defaultStartDate={detail.startDate}
            defaultEndDate={detail.endDate}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MemberTimeSummary
          label="Tracked hours"
          value={formatDuration(detail.summary.totalSeconds)}
          helper="Sum of all entries"
        />
        <MemberTimeSummary
          label="Actual hours"
          value={formatDuration(detail.summary.actualSeconds)}
          helper="Overlap counted once"
        />
        <MemberTimeSummary
          label="Overlap"
          value={formatDuration(detail.summary.overlapSeconds)}
          helper={
            detail.summary.overlapSeconds > 0
              ? 'Concurrent entries'
              : 'No overlapping time'
          }
        />
      </div>

      <div className="grid min-w-0 gap-3">
        <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Timer className="size-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="m-0 truncate text-sm font-bold text-foreground">
                Current Activity
              </p>
              <p className="m-0 truncate text-xs text-muted-foreground">
                {detail.activity.activeEntry
                  ? `Working now: ${
                      detail.activity.activeEntry.taskName ??
                      detail.activity.activeEntry.description
                    }`
                  : 'Open as a sheet without changing the entries table'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => dispatch({ type: 'openActivitySheet' })}
            className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent sm:w-auto"
          >
            <PanelRightOpen className="size-3.5" />
            Open
          </button>
        </div>

        <AnalyticsEntriesTable
          entries={tableEntries}
          entriesTotal={detail.entriesTotal}
          page={detail.page}
          onPageChange={onChangePage}
          timezone={detail.timezone}
          onEditEntry={canEditEntries ? openEdit : undefined}
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
