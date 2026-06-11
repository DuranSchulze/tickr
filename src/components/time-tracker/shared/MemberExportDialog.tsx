import { useEffect, useState } from 'react'
import { FileDown, FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import { gooeyToast } from '#/lib/toast'
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
import { getMemberMonthlyReportFn } from '#/lib/server/tracker'
import {
  downloadMemberReportCsv,
  downloadMemberReportPdf,
} from '#/lib/time-tracker/member-report-export'

type ExportFormat = 'pdf' | 'csv'

const pad = (n: number) => String(n).padStart(2, '0')
const fmt = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const monthStartStr = () => {
  const now = new Date()
  return fmt(new Date(now.getFullYear(), now.getMonth(), 1))
}
const todayStr = () => fmt(new Date())

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
  const [startDate, setStartDate] = useState(
    defaultStartDate ?? monthStartStr(),
  )
  const [endDate, setEndDate] = useState(defaultEndDate ?? todayStr())
  const [exporting, setExporting] = useState<ExportFormat | null>(null)

  // Reset the range to the provided defaults each time the dialog opens.
  useEffect(() => {
    if (open) {
      setStartDate(defaultStartDate ?? monthStartStr())
      setEndDate(defaultEndDate ?? todayStr())
    }
  }, [open, defaultStartDate, defaultEndDate])

  const today = todayStr()
  const invalid = !startDate || !endDate || startDate > endDate

  async function handleExport(format: ExportFormat) {
    setExporting(format)
    try {
      const report = await getMemberMonthlyReportFn({
        data: { memberId, startDate, endDate },
      })
      if (format === 'pdf') {
        await downloadMemberReportPdf(report)
      } else {
        downloadMemberReportCsv(report)
      }
      onOpenChange(false)
    } catch (err) {
      gooeyToast.error('Export failed', {
        description:
          err instanceof Error ? err.message : 'Could not generate report.',
      })
    } finally {
      setExporting(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
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

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <label className="text-xs font-semibold text-foreground">
              Start date
            </label>
            <input
              type="date"
              value={startDate}
              max={endDate || today}
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
              max={today}
              onChange={(e) => setEndDate(e.target.value)}
              aria-label="End date"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={exporting !== null}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="outline"
            onClick={() => handleExport('csv')}
            disabled={invalid || exporting !== null}
          >
            {exporting === 'csv' ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="mr-2 size-4" />
            )}
            CSV
          </Button>
          <Button
            onClick={() => handleExport('pdf')}
            disabled={invalid || exporting !== null}
          >
            {exporting === 'pdf' ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <FileText className="mr-2 size-4" />
            )}
            PDF
          </Button>
        </DialogFooter>
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
  size = 'md',
  className = '',
}: {
  memberId: string
  memberName?: string
  defaultStartDate?: string
  defaultEndDate?: string
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
        onClick={() => setOpen(true)}
        className={`no-print inline-flex items-center gap-1.5 rounded-lg border border-border bg-background font-semibold text-foreground transition-colors hover:bg-accent ${sizeClasses} ${className}`}
      >
        <FileDown className={iconClasses} />
        Export
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
