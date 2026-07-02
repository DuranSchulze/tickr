import { useMemo, useRef, useState } from 'react'
import { Layers } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  getBulkReportFn,
  getBulkReportOngoingTaskSummaryFn,
} from '#/lib/server/tracker'
import type { BulkReportScopeType } from '#/lib/server/tracker.server'
import {
  downloadBulkReportCsv,
  downloadBulkReportPdf,
} from '#/lib/time-tracker/bulk-report-export'
import type { TrackerState } from '#/lib/time-tracker/types'
import { Combobox } from '#/components/ui/combobox'
import type { ComboboxOption } from '#/components/ui/combobox'
import { ExportDateRangePicker } from './ExportDateRangePicker'
import { ExportActionsFooter } from './export-dialog-footer'
import { ExportOngoingTasksDialog } from './ExportOngoingTasksDialog'
import { ExportSortControls } from './ExportSortControls'
import { useExportDialogState } from './export-dialog-state'
import type { ExportFormat } from './export-dialog-state'
import type {
  ExportSortBy,
  ExportSortOrder,
} from '#/lib/time-tracker/export-sort'
import { hasOngoingExportTasks } from '#/lib/time-tracker/export-ongoing-tasks'
import type { ExportOngoingTaskSummary } from '#/lib/time-tracker/export-ongoing-tasks'

const scopeOptions: { value: BulkReportScopeType; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'client', label: 'Client' },
  { value: 'department', label: 'Department' },
  { value: 'tag', label: 'Tag' },
]

type BulkExportScopeState = {
  open: boolean
  scopeType: BulkReportScopeType
  scopeId: string
  memberId: string
  clientId: string
  sortBy: ExportSortBy
  sortOrder: ExportSortOrder
}

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
  const [scopeState, setScopeState] = useState<BulkExportScopeState>({
    open: false,
    scopeType: 'all',
    scopeId: '',
    memberId: '',
    clientId: '',
    sortBy: 'date',
    sortOrder: 'asc',
  })
  const [checkingFormat, setCheckingFormat] = useState<ExportFormat | null>(
    null,
  )
  const pendingExportFormatRef = useRef<ExportFormat | null>(null)
  const [ongoingTaskSummary, setOngoingTaskSummary] =
    useState<ExportOngoingTaskSummary | null>(null)
  const [ongoingWarningOpen, setOngoingWarningOpen] = useState(false)

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
    onOpenChange: setOpen,
    defaultStartDate,
    defaultEndDate,
  })
  const scopeType = scopeState.open === open ? scopeState.scopeType : 'all'
  const scopeId = scopeState.open === open ? scopeState.scopeId : ''
  const memberId = scopeState.open === open ? scopeState.memberId : ''
  const clientId = scopeState.open === open ? scopeState.clientId : ''
  const sortBy = scopeState.open === open ? scopeState.sortBy : 'date'
  const sortOrder = scopeState.open === open ? scopeState.sortOrder : 'asc'

  const scopeEntities =
    scopeType === 'client'
      ? state.clients
      : scopeType === 'department'
        ? state.departments
        : scopeType === 'tag'
          ? state.tags
          : []
  const scopeEntityOptions = scopeEntities.map((entity) => ({
    value: entity.id,
    label: entity.name,
  }))
  const clientFilterHidden = scopeType === 'client'
  const memberOptions = useMemo(
    () => [
      { value: '', label: 'All members' },
      ...state.members.map((member) => ({
        value: member.id,
        label: member.name,
        description: member.email,
      })),
    ],
    [state.members],
  )
  const clientOptions = useMemo(
    () => [
      { value: '', label: 'All clients' },
      ...state.clients.map((client) => ({
        value: client.id,
        label: client.name,
      })),
    ],
    [state.clients],
  )
  const needsScopeId = scopeType !== 'all'
  const invalid = invalidRange || (needsScopeId && !scopeId)

  function handleDialogOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setScopeState((prev) => ({ ...prev, open: false }))
      setOngoingWarningOpen(false)
      setOngoingTaskSummary(null)
      pendingExportFormatRef.current = null
    }
    handleOpenChange(nextOpen)
  }

  function getReportPayload(range: { startDate: string; endDate: string }) {
    return {
      startDate: range.startDate,
      endDate: range.endDate,
      scopeType,
      scopeId: needsScopeId ? scopeId : undefined,
      memberId: memberId || undefined,
      clientId: !clientFilterHidden && clientId ? clientId : undefined,
      sortBy,
      sortOrder,
    }
  }

  async function runBulkExport(format: ExportFormat) {
    await runExport(format, async (_, range) => {
      const report = await getBulkReportFn({
        data: getReportPayload(range),
      })
      if (format === 'pdf') {
        await downloadBulkReportPdf(report)
      } else {
        downloadBulkReportCsv(report)
      }
    })
  }

  async function handleExport(format: ExportFormat) {
    setCheckingFormat(format)
    try {
      const summary = await getBulkReportOngoingTaskSummaryFn({
        data: getReportPayload({ startDate, endDate }),
      })
      if (hasOngoingExportTasks(summary)) {
        setOngoingTaskSummary(summary)
        pendingExportFormatRef.current = format
        setOngoingWarningOpen(true)
        return
      }
      await runBulkExport(format)
    } finally {
      setCheckingFormat(null)
    }
  }

  async function handleConfirmedExport() {
    const format = pendingExportFormatRef.current
    if (!format) return
    setOngoingWarningOpen(false)
    pendingExportFormatRef.current = null
    await runBulkExport(format)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setScopeState((prev) => ({ ...prev, open: true }))
          setOpen(true)
        }}
        className={`no-print inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent ${className}`}
      >
        <Layers className="size-4" />
        Export
      </button>

      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[68rem]">
          <DialogHeader>
            <DialogTitle>Export</DialogTitle>
            <DialogDescription>
              Export one report for a date range, grouped by member with
              computed billing.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 lg:grid-cols-[minmax(17rem,21rem)_minmax(0,1fr)] lg:items-start">
            <div className="grid min-w-0 gap-4">
              <ScopeSelector
                scopeType={scopeType}
                onChange={(nextScopeType) =>
                  setScopeState((prev) => ({
                    ...prev,
                    scopeType: nextScopeType,
                    scopeId: '',
                    clientId: nextScopeType === 'client' ? '' : prev.clientId,
                  }))
                }
              />

              {needsScopeId && (
                <ScopeValueSelector
                  scopeType={scopeType}
                  scopeId={scopeId}
                  options={scopeEntityOptions}
                  hasEntities={scopeEntities.length > 0}
                  onChange={(value) =>
                    setScopeState((prev) => ({
                      ...prev,
                      scopeId: value,
                    }))
                  }
                />
              )}

              <ReportFilters
                memberOptions={memberOptions}
                memberId={memberId}
                onMemberChange={(value) =>
                  setScopeState((prev) => ({ ...prev, memberId: value }))
                }
                showClient={!clientFilterHidden}
                clientOptions={clientOptions}
                clientId={clientId}
                onClientChange={(value) =>
                  setScopeState((prev) => ({
                    ...prev,
                    clientId: value,
                  }))
                }
                sortBy={sortBy}
                onSortByChange={(value) =>
                  setScopeState((prev) => ({ ...prev, sortBy: value }))
                }
                sortOrder={sortOrder}
                onSortOrderChange={(value) =>
                  setScopeState((prev) => ({ ...prev, sortOrder: value }))
                }
              />
            </div>

            <div className="min-w-0">
              <ExportDateRangePicker
                startDate={startDate}
                endDate={endDate}
                onChangeRange={setRange}
              />
            </div>
          </div>

          <ExportActionsFooter
            exporting={checkingFormat ?? exporting}
            invalid={invalid}
            onExport={handleExport}
          />
        </DialogContent>
      </Dialog>
      <ExportOngoingTasksDialog
        open={ongoingWarningOpen}
        summary={ongoingTaskSummary}
        pending={exporting !== null}
        onOpenChange={setOngoingWarningOpen}
        onConfirm={() => void handleConfirmedExport()}
      />
    </>
  )
}

function ScopeSelector({
  scopeType,
  onChange,
}: {
  scopeType: BulkReportScopeType
  onChange: (scopeType: BulkReportScopeType) => void
}) {
  return (
    <div className="grid gap-2">
      <span className="text-xs font-semibold text-foreground">Export</span>
      <div className="grid grid-cols-2 gap-2">
        {scopeOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
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
  )
}

function ScopeValueSelector({
  scopeType,
  scopeId,
  options,
  hasEntities,
  onChange,
}: {
  scopeType: Exclude<BulkReportScopeType, 'all'> | BulkReportScopeType
  scopeId: string
  options: ComboboxOption[]
  hasEntities: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="grid gap-1.5 text-xs font-semibold text-foreground">
      <span>Select {scopeType}</span>
      <Combobox
        options={options}
        value={scopeId}
        onValueChange={onChange}
        placeholder={`Choose a ${scopeType}...`}
        searchPlaceholder={`Search ${scopeType}s...`}
        emptyText={`No ${scopeType}s found.`}
        disabled={!hasEntities}
        className="h-9 rounded-lg"
        contentClassName="z-[60]"
      />
      {!hasEntities && (
        <span className="text-xs text-muted-foreground">
          No {scopeType}s available.
        </span>
      )}
    </div>
  )
}

function ReportFilters({
  memberOptions,
  memberId,
  onMemberChange,
  showClient,
  clientOptions,
  clientId,
  onClientChange,
  sortBy,
  onSortByChange,
  sortOrder,
  onSortOrderChange,
}: {
  memberOptions: ComboboxOption[]
  memberId: string
  onMemberChange: (value: string) => void
  showClient: boolean
  clientOptions: ComboboxOption[]
  clientId: string
  onClientChange: (value: string) => void
  sortBy: ExportSortBy
  onSortByChange: (value: ExportSortBy) => void
  sortOrder: ExportSortOrder
  onSortOrderChange: (value: ExportSortOrder) => void
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-background p-3">
      <div className="min-w-0">
        <p className="m-0 text-xs font-semibold text-foreground">Filters</p>
      </div>
      <FilterCombobox
        label="Member"
        options={memberOptions}
        value={memberId}
        onValueChange={onMemberChange}
        searchPlaceholder="Search members..."
        emptyText="No members found."
      />

      {showClient && (
        <FilterCombobox
          label="Client"
          options={clientOptions}
          value={clientId}
          onValueChange={onClientChange}
          searchPlaceholder="Search clients..."
          emptyText="No clients found."
        />
      )}

      <ExportSortControls
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortByChange={onSortByChange}
        onSortOrderChange={onSortOrderChange}
      />
    </div>
  )
}

function FilterCombobox({
  label,
  options,
  value,
  onValueChange,
  searchPlaceholder,
  emptyText,
}: {
  label: string
  options: ComboboxOption[]
  value: string
  onValueChange: (value: string) => void
  searchPlaceholder: string
  emptyText: string
}) {
  return (
    <div className="grid gap-1.5 text-xs font-semibold text-foreground">
      <span>{label}</span>
      <Combobox
        options={options}
        value={value}
        onValueChange={onValueChange}
        searchPlaceholder={searchPlaceholder}
        emptyText={emptyText}
        className="h-9 rounded-lg"
        contentClassName="z-[60]"
      />
    </div>
  )
}
