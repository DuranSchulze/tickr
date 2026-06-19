import { useState } from 'react'
import { ArrowLeft, PanelRightOpen, Timer } from 'lucide-react'
import type { DepartmentMemberDetail } from '#/lib/server/tracker/department-dashboard.server'
import { AnalyticsDateRange } from '../AnalyticsDateRange'
import { AnalyticsEntriesTable } from '../AnalyticsEntriesTable'
import { DepartmentMemberActivitySheet } from './DepartmentMemberActivitySheet'

export function DepartmentMemberDetailScreen({
  detail,
  onBack,
  onChangeRange,
  onChangePage,
}: {
  detail: DepartmentMemberDetail
  onBack: () => void
  onChangeRange: (startDate: string, endDate: string) => void
  onChangePage: (page: number) => void
}) {
  const [activitySheetOpen, setActivitySheetOpen] = useState(false)

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

        <AnalyticsDateRange
          range={{ startDate: detail.startDate, endDate: detail.endDate }}
          onChangeRange={(range) =>
            onChangeRange(range.startDate, range.endDate)
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
          currency={detail.currency}
        />
      </div>

      <DepartmentMemberActivitySheet
        memberId={activitySheetOpen ? detail.activity.member.id : null}
        onClose={() => setActivitySheetOpen(false)}
      />
    </div>
  )
}
