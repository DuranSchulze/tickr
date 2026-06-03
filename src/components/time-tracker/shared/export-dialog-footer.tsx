import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import { DialogClose, DialogFooter } from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'

export interface ExportDialogFooterProps {
  startDate: string
  endDate: string
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  startDateMin?: string
  startDateMax?: string
  endDateMin?: string
  endDateMax?: string
  today: string
  exporting: 'csv' | 'pdf' | null
  invalid: boolean
  onExport: (format: 'csv' | 'pdf') => void
  onCancel: () => void
}

/**
 * Shared date-range picker + export buttons (CSV / PDF) used by
 * {@link BulkExportButton} and {@link MemberExportDialog}.
 */
export function ExportDialogFooter({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  startDateMin,
  startDateMax,
  endDateMin,
  endDateMax,
  today,
  exporting,
  invalid,
  onExport,
  onCancel,
}: ExportDialogFooterProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <label className="text-xs font-semibold text-foreground">
            Start date
          </label>
          <input
            type="date"
            value={startDate}
            min={startDateMin}
            max={startDateMax ?? today}
            onChange={(e) => onStartDateChange(e.target.value)}
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
            min={endDateMin}
            max={endDateMax ?? today}
            onChange={(e) => onEndDateChange(e.target.value)}
            aria-label="End date"
            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button
            variant="outline"
            disabled={exporting !== null}
            onClick={onCancel}
          >
            Cancel
          </Button>
        </DialogClose>
        <Button
          variant="outline"
          onClick={() => onExport('csv')}
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
          onClick={() => onExport('pdf')}
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
    </>
  )
}
