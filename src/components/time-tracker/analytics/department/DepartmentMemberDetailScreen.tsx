import { useState } from 'react'
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
  const [activitySheetOpen, setActivitySheetOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)
  const [editingDraft, setEditingDraft] = useState<DraftEntry>(() =>
    emptyDraft(),
  )
  const [savePending, setSavePending] = useState(false)

  function openEdit(entry: AnalyticsTimeEntryRow) {
    const project = state.projects.find((p) => p.id === entry.projectId)
    setEditingEntry({
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
    })
    setEditingDraft({
      description: entry.description,
      clientId: project?.clientId ?? '',
      projectId: entry.projectId,
      taskId: entry.taskId ?? '',
      tagIds: entry.tagIds,
      billable: entry.billable,
      startedAt: dateTimeLocalValue(new Date(entry.startedAt)),
      endedAt: dateTimeLocalValue(new Date(entry.endedAt ?? Date.now())),
      notes: entry.notes,
    })
  }

  async function saveEdit() {
    if (!editingEntry || !editingDraft.description.trim()) return

    setSavePending(true)
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
      setEditingEntry(null)
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: trackerKeys.departmentMemberDetails,
        }),
        queryClient.invalidateQueries({
          queryKey: ['department-dashboard'],
        }),
      ])
      void router.invalidate()
      gooeyToast.success('Entry updated')
    } catch (err) {
      gooeyToast.error('Action failed', {
        description:
          err instanceof Error ? err.message : 'Something went wrong.',
      })
    } finally {
      setSavePending(false)
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
            onClick={() => setActivitySheetOpen(true)}
            className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent sm:w-auto"
          >
            <PanelRightOpen className="size-3.5" />
            Open
          </button>
        </div>

        <AnalyticsEntriesTable
          entries={detail.entries}
          entriesTotal={detail.entriesTotal}
          page={detail.page}
          onPageChange={onChangePage}
          timezone={detail.timezone}
          onEditEntry={canEditEntries ? openEdit : undefined}
        />
      </div>

      <DepartmentMemberActivitySheet
        memberId={activitySheetOpen ? detail.activity.member.id : null}
        onClose={() => setActivitySheetOpen(false)}
      />

      <EditEntryDrawer
        open={!!editingEntry}
        onOpenChange={(open) => {
          if (!open) setEditingEntry(null)
        }}
        entry={editingEntry}
        editingDraft={editingDraft}
        setEditingDraft={setEditingDraft}
        clients={state.clients}
        projects={state.projects}
        projectTasks={state.projectTasks}
        tags={state.tags}
        canManageCatalog={false}
        pending={savePending}
        onSave={saveEdit}
        onCancel={() => setEditingEntry(null)}
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
