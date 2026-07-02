import { useState } from 'react'
import { gooeyToast } from '#/lib/toast'

export type ExportFormat = 'pdf' | 'csv'

type ExportRange = {
  startDate: string
  endDate: string
}

type ExportState = ExportRange & {
  open: boolean
}

type UseExportDialogStateOptions = {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultStartDate?: string
  defaultEndDate?: string
  errorDescription?: string
}

const pad = (n: number) => String(n).padStart(2, '0')

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`
}

export function monthStartStr() {
  const now = new Date()
  return formatDateKey(new Date(now.getFullYear(), now.getMonth(), 1))
}

export function todayStr() {
  return formatDateKey(new Date())
}

function getDefaultRange(
  defaultStartDate?: string,
  defaultEndDate?: string,
): ExportRange {
  return {
    startDate: defaultStartDate ?? monthStartStr(),
    endDate: defaultEndDate ?? todayStr(),
  }
}

export function isInvalidExportRange(range: ExportRange) {
  return !range.startDate || !range.endDate || range.startDate > range.endDate
}

export function useExportDialogState({
  open,
  onOpenChange,
  defaultStartDate,
  defaultEndDate,
  errorDescription = 'Could not generate report.',
}: UseExportDialogStateOptions) {
  const [formState, setFormState] = useState<ExportState>({
    open: false,
    ...getDefaultRange(defaultStartDate, defaultEndDate),
  })
  const [exporting, setExporting] = useState<ExportFormat | null>(null)

  const fallbackRange = getDefaultRange(defaultStartDate, defaultEndDate)
  const range = formState.open === open ? formState : fallbackRange
  const invalidRange = isInvalidExportRange(range)

  function setRange(nextRange: ExportRange) {
    setFormState({
      open,
      ...nextRange,
    })
  }

  function resetRange() {
    setFormState((prev) => ({ ...prev, open: false }))
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetRange()
    onOpenChange(nextOpen)
  }

  function closeDialog() {
    resetRange()
    onOpenChange(false)
  }

  async function runExport(
    format: ExportFormat,
    exportReport: (format: ExportFormat, range: ExportRange) => Promise<void>,
  ) {
    setExporting(format)
    try {
      await exportReport(format, range)
      closeDialog()
    } catch (err) {
      gooeyToast.error('Export failed', {
        description: err instanceof Error ? err.message : errorDescription,
      })
    } finally {
      setExporting(null)
    }
  }

  return {
    startDate: range.startDate,
    endDate: range.endDate,
    exporting,
    invalidRange,
    setRange,
    handleOpenChange,
    runExport,
  }
}
