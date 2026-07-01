import { useState } from 'react'
import { FileSpreadsheet, FileText, Layers, Loader2 } from 'lucide-react'
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
import { getBulkReportFn } from '#/lib/server/tracker'
import type { BulkReportScopeType } from '#/lib/server/tracker.server'
import {
  downloadBulkReportCsv,
  downloadBulkReportPdf,
} from '#/lib/time-tracker/bulk-report-export'
import type { TrackerState } from '#/lib/time-tracker/types'
import { ExportDateRangePicker } from './ExportDateRangePicker'

type ExportFormat = 'pdf' | 'csv'

const pad = (n: number) => String(n).padStart(2, '0')
const fmt = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const monthStartStr = () => {
  const now = new Date()
  return fmt(new Date(now.getFullYear(), now.getMonth(), 1))
}
const todayStr = () => fmt(new Date())

const scopeOptions: { value: BulkReportScopeType; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'client', label: 'Client' },
  { value: 'department', label: 'Department' },
  { value: 'tag', label: 'Tag' },
]

/**
 * Bulk report export: one PDF/CSV for a date range, scoped to everything or a
 * single client / department / tag. Grouped by member with computed billing.
 * Permissions are enforced server-side by `getBulkReport`.
 */
export function BulkExportButton({
  state,
  defaultStartDate,
  defaultEndDate,
  className = '',
}: {
  state: TrackerState
  defaultStartDate?: string
  defaultEndDate?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  // Key form state by `open` — resets to defaults automatically when dialog opens
  const [formState, setFormState] = useState<{
    open: boolean
    scopeType: BulkReportScopeType
    scopeId: string
    startDate: string
    endDate: string
  }>({
    open: false,
    scopeType: 'all',
    scopeId: '',
    startDate: defaultStartDate ?? monthStartStr(),
    endDate: defaultEndDate ?? todayStr(),
  })

  const scopeType = formState.open === open ? formState.scopeType : 'all'
  const scopeId = formState.open === open ? formState.scopeId : ''
  const startDate =
    formState.open === open
      ? formState.startDate
      : (defaultStartDate ?? monthStartStr())
  const endDate =
    formState.open === open ? formState.endDate : (defaultEndDate ?? todayStr())

  const [exporting, setExporting] = useState<ExportFormat | null>(null)

  const scopeEntities =
    scopeType === 'client'
      ? state.clients
      : scopeType === 'department'
        ? state.departments
        : scopeType === 'tag'
          ? state.tags
          : []
  const needsScopeId = scopeType !== 'all'
  const invalid =
    !startDate || !endDate || startDate > endDate || (needsScopeId && !scopeId)

  async function handleExport(format: ExportFormat) {
    setExporting(format)
    try {
      const report = await getBulkReportFn({
        data: {
          startDate,
          endDate,
          scopeType,
          scopeId: needsScopeId ? scopeId : undefined,
        },
      })
      if (format === 'pdf') {
        await downloadBulkReportPdf(report)
      } else {
        downloadBulkReportCsv(report)
      }
      setOpen(false)
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
    <>
      <button
        type="button"
        onClick={() => {
          setFormState((prev) => ({ ...prev, open: true }))
          setOpen(true)
        }}
        className={`no-print inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent ${className}`}
      >
        <Layers className="size-4" />
        Export
      </button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) setFormState((prev) => ({ ...prev, open: false }))
          setOpen(o)
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Export</DialogTitle>
            <DialogDescription>
              Export one report for a date range, grouped by member with
              computed billing.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            {/* Scope */}
            <div className="grid gap-2">
              <span className="text-xs font-semibold text-foreground">
                Export
              </span>
              <div className="grid grid-cols-2 gap-2">
                {scopeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setFormState((prev) => ({
                        ...prev,
                        scopeType: opt.value,
                        scopeId: '',
                      }))
                    }}
                    className={`h-9 rounded-lg border px-3 text-sm font-semibold transition-colors ${
                      scopeType === opt.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background text-muted-foreground hover:bg-accent'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scope value */}
            {needsScopeId && (
              <div className="grid gap-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Select {scopeType}
                </label>
                <select
                  value={scopeId}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      scopeId: e.target.value,
                    }))
                  }
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Choose a {scopeType}…</option>
                  {scopeEntities.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.name}
                    </option>
                  ))}
                </select>
                {scopeEntities.length === 0 && (
                  <span className="text-xs text-muted-foreground">
                    No {scopeType}s available.
                  </span>
                )}
              </div>
            )}

            <ExportDateRangePicker
              startDate={startDate}
              endDate={endDate}
              onChangeRange={(range) =>
                setFormState((prev) => ({
                  ...prev,
                  startDate: range.startDate,
                  endDate: range.endDate,
                }))
              }
            />
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
    </>
  )
}
