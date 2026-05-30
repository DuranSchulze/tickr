import { useState } from 'react'
import {
  ChevronDown,
  FileText,
  Loader2,
  Printer,
  RefreshCcw,
} from 'lucide-react'
import { gooeyToast } from 'goey-toast'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'

export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function ExportMenu({
  onExportCsv,
  onSyncToSheet,
  disabled = false,
}: {
  onExportCsv: () => Promise<void>
  onSyncToSheet?: () => Promise<void>
  disabled?: boolean
}) {
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  async function handleCsv() {
    setLoading(true)
    try {
      await onExportCsv()
    } catch (err) {
      gooeyToast.error('Export failed', {
        description:
          err instanceof Error ? err.message : 'Could not generate CSV.',
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleSync() {
    if (!onSyncToSheet) return
    setSyncing(true)
    try {
      await onSyncToSheet()
    } catch (err) {
      gooeyToast.error('Sync failed', {
        description:
          err instanceof Error ? err.message : 'Could not sync to sheet.',
      })
    } finally {
      setSyncing(false)
    }
  }

  const isBusy = loading || syncing

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled || isBusy}
        className="no-print inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isBusy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileText className="h-4 w-4" />
        )}
        Export
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={handleCsv} disabled={isBusy}>
          <FileText className="mr-2 h-4 w-4" />
          Export CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print / Save as PDF
        </DropdownMenuItem>
        {onSyncToSheet && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSync} disabled={isBusy}>
              <RefreshCcw
                className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`}
              />
              Sync to sheet
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
