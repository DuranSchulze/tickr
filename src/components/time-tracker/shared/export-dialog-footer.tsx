import { useId } from 'react'
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import { DialogClose, DialogFooter } from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'
import type { ExportFormat } from './export-dialog-state'

export interface ExportActionsFooterProps {
  exporting: ExportFormat | null
  invalid: boolean
  onExport: (format: ExportFormat) => void
}

export function ExportActionsFooter({
  exporting,
  invalid,
  onExport,
}: ExportActionsFooterProps) {
  return (
    <DialogFooter>
      <DialogClose asChild>
        <Button variant="outline" disabled={exporting !== null}>
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
  )
}

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
 * Legacy date-input footer retained for any future compact export surface.
 * Current member and bulk dialogs use ExportDateRangePicker plus
 * ExportActionsFooter.
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
  const startDateId = useId()
  const endDateId = useId()

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <label
            htmlFor={startDateId}
            className="text-xs font-semibold text-foreground"
          >
            Start date
          </label>
          <input
            id={startDateId}
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
          <label
            htmlFor={endDateId}
            className="text-xs font-semibold text-foreground"
          >
            End date
          </label>
          <input
            id={endDateId}
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
