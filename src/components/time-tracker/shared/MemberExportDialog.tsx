import { useState } from 'react'
import { FileDown } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { getMemberMonthlyReportFn } from '#/lib/server/tracker'
import {
  downloadMemberReportCsv,
  downloadMemberReportPdf,
} from '#/lib/time-tracker/member-report-export'
import { ExportDateRangePicker } from './ExportDateRangePicker'
import { ExportActionsFooter } from './export-dialog-footer'
import { ExportSortControls } from './ExportSortControls'
import { useExportDialogState } from './export-dialog-state'
import type {
  ExportSortBy,
  ExportSortOrder,
} from '#/lib/time-tracker/export-sort'

/**
 * Single source of truth for per-member report export. Lets the user pick a
 * date range and download the report as PDF or CSV. Permissions are enforced
 * server-side by `getMemberMonthlyReport` (OWNER/ADMIN: anyone, MANAGER: their
 * department, EMPLOYEE: self), so there's no client-side gating here.
 *
 * Controlled: the caller owns `open`/`onOpenChange` so the trigger can be a
 * button, a dropdown item, etc. Use {@link MemberExportButton} for the common
 * "button that opens this dialog" case.
 */
export function MemberExportDialog({
  memberId,
  memberName,
  open,
  onOpenChange,
  defaultStartDate,
  defaultEndDate,
}: {
  memberId: string
  memberName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultStartDate?: string
  defaultEndDate?: string
}) {
  const [sortBy, setSortBy] = useState<ExportSortBy>('date')
  const [sortOrder, setSortOrder] = useState<ExportSortOrder>('asc')
  const {
    startDate,
    endDate,
    exporting,
    invalidRange,
    setRange,
    handleOpenChange,
    runExport,
  } = useExportDialogState({
    open,
    onOpenChange,
    defaultStartDate,
    defaultEndDate,
  })

  async function handleExport(format: 'pdf' | 'csv') {
    await runExport(format, async (_, range) => {
      const report = await getMemberMonthlyReportFn({
        data: { memberId, ...range, sortBy, sortOrder },
      })
      if (format === 'pdf') {
        await downloadMemberReportPdf(report)
      } else {
        downloadMemberReportCsv(report)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[52rem]">
        <DialogHeader>
          <DialogTitle>Export Time Report</DialogTitle>
          <DialogDescription>
            Choose a date range to include in the report
            {memberName ? (
              <>
                {' '}
                for{' '}
                <span className="font-semibold text-foreground">
                  {memberName}
                </span>
              </>
            ) : null}
            .
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] md:items-start">
          <ExportDateRangePicker
            startDate={startDate}
            endDate={endDate}
            onChangeRange={setRange}
          />

          <div className="rounded-lg border border-border bg-background p-3">
            <ExportSortControls
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortByChange={setSortBy}
              onSortOrderChange={setSortOrder}
            />
          </div>
        </div>

        <ExportActionsFooter
          exporting={exporting}
          invalid={invalidRange}
          onExport={handleExport}
        />
      </DialogContent>
    </Dialog>
  )
}

/**
 * Convenience trigger: a button that opens {@link MemberExportDialog}. Use this
 * wherever a standalone export control is needed (member detail, analytics,
 * team activity cards). For a custom trigger (e.g. a dropdown item), render
 * {@link MemberExportDialog} directly with your own open state.
 */
export function MemberExportButton({
  memberId,
  memberName,
  defaultStartDate,
  defaultEndDate,
  label = 'Export',
  size = 'md',
  className = '',
}: {
  memberId: string
  memberName?: string
  defaultStartDate?: string
  defaultEndDate?: string
  label?: string
  size?: 'sm' | 'md'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const sizeClasses = size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3 text-sm'
  const iconClasses = size === 'sm' ? 'size-3.5' : 'size-4'

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
        }}
        className={`no-print inline-flex items-center gap-1.5 rounded-lg border border-border bg-background font-semibold text-foreground transition-colors hover:bg-accent ${sizeClasses} ${className}`}
      >
        <FileDown className={iconClasses} />
        {label}
      </button>
      <MemberExportDialog
        memberId={memberId}
        memberName={memberName}
        open={open}
        onOpenChange={setOpen}
        defaultStartDate={defaultStartDate}
        defaultEndDate={defaultEndDate}
      />
    </>
  )
}
