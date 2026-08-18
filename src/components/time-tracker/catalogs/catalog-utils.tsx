// oxlint-disable-next-line react/only-export-components — utility functions and hooks in a .tsx file
import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { gooeyToast } from '#/lib/toast'
import {
  Archive,
  CheckCircle,
  FileSpreadsheet,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Table as TableIcon,
} from 'lucide-react'
import { formatCurrency } from '#/lib/time-tracker/billing'
import {
  ensureCatalogTabsFn,
  syncCatalogsWithSheetFn,
} from '#/lib/server/gsheets/sync'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { useTaskSyncPublisher } from '../TaskSyncCoordinator'

// ---------------------------------------------------------------------------
// Shared utility: formatSeconds
// ---------------------------------------------------------------------------

function formatSeconds(seconds: number): string {
  if (seconds === 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

// ---------------------------------------------------------------------------
// Hook: catalog sheet sync state + handlers
// Provides the common sheet-sync lifecycle shared across Clients, Projects,
// and Tags table pages.
// ---------------------------------------------------------------------------

export function useCatalogSheetSync() {
  const router = useRouter()
  const publishTaskChange = useTaskSyncPublisher()
  const [sheetLoading, setSheetLoading] = useState(false)
  const [showSyncDialog, setShowSyncDialog] = useState(false)

  async function handleSync() {
    setSheetLoading(true)
    try {
      const result = await syncCatalogsWithSheetFn()
      await router.invalidate()
      publishTaskChange()
      gooeyToast.success(
        `Synced ${result.clients} clients, ${result.projects} projects, ${result.tags} tags`,
      )
    } catch (err) {
      gooeyToast.error('Sync failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setSheetLoading(false)
    }
  }

  async function handleSetupSheetTab() {
    setSheetLoading(true)
    try {
      await ensureCatalogTabsFn()
      gooeyToast.success('Sheet tab ready')
    } catch (err) {
      gooeyToast.error('Setup failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setSheetLoading(false)
    }
  }

  function handleImportFromSheet() {
    setShowSyncDialog(true)
  }

  return {
    sheetLoading,
    setSheetLoading,
    showSyncDialog,
    handleSync,
    handleSetupSheetTab,
    handleImportFromSheet,
    setShowSyncDialog,
    router,
  }
}

// ---------------------------------------------------------------------------
// Component: CatalogSheetButton
// The Google Sheet dropdown button shared across Clients, Projects, and Tags
// table pages.
// ---------------------------------------------------------------------------

interface CatalogSheetButtonProps {
  sheetLoading: boolean
  googleSheetUrl: string | null
  canManage: boolean
  canImportSheet: boolean
  onImportFromSheet: () => void
  onSyncAll: () => void
  onSetupTab: () => void
}

export function CatalogSheetButton({
  sheetLoading,
  googleSheetUrl,
  canManage,
  canImportSheet,
  onImportFromSheet,
  onSyncAll,
  onSetupTab,
}: CatalogSheetButtonProps) {
  if (!canImportSheet) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={sheetLoading || !googleSheetUrl}
        title={
          !googleSheetUrl
            ? 'Configure a Google Sheet URL in workspace settings to enable import'
            : undefined
        }
        aria-label="Google Sheet actions"
        aria-busy={sheetLoading}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sheetLoading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <FileSpreadsheet className="size-4" aria-hidden />
        )}
        Sheet
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onImportFromSheet}>
          <RefreshCw className="mr-2 size-4" />
          Sync from Sheet
        </DropdownMenuItem>
        {canManage && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onSyncAll}>
              <RefreshCw className="mr-2 size-4" />
              Sync all catalogs
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onSetupTab}>
              <TableIcon className="mr-2 size-4" />
              Setup Sheet Tab
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---------------------------------------------------------------------------
// Hook: shared archive/activate handler factory
// ---------------------------------------------------------------------------

export function useArchiveActivate<
  T extends { id: string; name: string },
>(opts: {
  archiveFn: (args: { data: { id: string } }) => Promise<unknown>
  activateFn: (args: { data: { id: string } }) => Promise<unknown>
  onSuccess?: () => void
}) {
  const router = useRouter()
  const publishTaskChange = useTaskSyncPublisher()
  const [archivingId, setArchivingId] = useState<string | null>(null)

  async function handleArchive(item: T) {
    setArchivingId(item.id)
    try {
      await opts.archiveFn({ data: { id: item.id } })
      await router.invalidate()
      publishTaskChange()
      opts.onSuccess?.()
      gooeyToast.success(`"${item.name}" archived`)
    } catch (err) {
      gooeyToast.error('Failed to archive', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setArchivingId(null)
    }
  }

  async function handleActivate(item: T) {
    setArchivingId(item.id)
    try {
      await opts.activateFn({ data: { id: item.id } })
      await router.invalidate()
      publishTaskChange()
      opts.onSuccess?.()
      gooeyToast.success(`"${item.name}" activated`)
    } catch (err) {
      gooeyToast.error('Failed to activate', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setArchivingId(null)
    }
  }

  return {
    archivingId,
    handleArchive,
    handleActivate,
    setArchivingId,
  }
}

// ---------------------------------------------------------------------------
// Column factories: shared column definitions for catalog table pages
// ---------------------------------------------------------------------------

/** Column showing a name with a color pill, shared by Projects and Tags. */
export function createNameColorColumn<
  T extends { name: string; color: string },
>(): ColumnDef<T> {
  return {
    accessorKey: 'name',
    header: 'Name',
    cell: ({
      getValue,
      row,
    }: {
      getValue: () => string
      row: { original: { color: string } }
    }) => (
      <div className="flex items-center gap-2">
        <span
          className="size-3 shrink-0 rounded-full border border-white/20"
          style={{ backgroundColor: row.original.color }}
        />
        <span className="font-semibold text-foreground">{getValue()}</span>
      </div>
    ),
  } as ColumnDef<T>
}

/** Column showing a simple name (no color pill). */
export function createSimpleNameColumn<
  T extends { name: string },
>(): ColumnDef<T> {
  return {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ getValue }: { getValue: () => string }) => (
      <span className="font-semibold text-foreground">{getValue()}</span>
    ),
  } as ColumnDef<T>
}

/** Column showing a status with a colored dot (e.g. Active/Inactive). */
export function createStatusColumn<
  T extends { clientStatus: string },
>(): ColumnDef<T> {
  return {
    accessorKey: 'clientStatus',
    header: 'Status',
    cell: ({ getValue }: { getValue: () => string }) => {
      const status = getValue()
      const color =
        status === 'ACTIVE'
          ? 'bg-emerald-500'
          : status === 'SUSPENDED'
            ? 'bg-amber-500'
            : 'bg-muted-foreground'
      const label =
        status === 'ACTIVE'
          ? 'Active'
          : status === 'SUSPENDED'
            ? 'Suspended'
            : 'Inactive'
      return (
        <span className="inline-flex items-center gap-1.5 text-sm">
          <span className={`size-1.5 rounded-full ${color}`} />
          {label}
        </span>
      )
    },
  } as ColumnDef<T>
}

/** Column showing entry count formatted as "N entries" or "—". */
export function createEntryCountColumn<
  T extends { entryCount: number },
>(): ColumnDef<T> {
  return {
    accessorKey: 'entryCount',
    header: 'Uses',
    cell: ({ getValue }: { getValue: () => number }) => {
      const count = getValue()
      return (
        <span className="text-sm tabular-nums text-muted-foreground">
          {count === 0 ? '—' : `${count} ${count === 1 ? 'entry' : 'entries'}`}
        </span>
      )
    },
  } as ColumnDef<T>
}

/** Column showing total seconds formatted as hours/minutes. */
export function createTotalHoursColumn<
  T extends { totalSeconds: number },
>(): ColumnDef<T> {
  return {
    accessorKey: 'totalSeconds',
    header: 'Total Hours',
    cell: ({ getValue }) => (
      <span className="text-sm tabular-nums text-muted-foreground">
        {formatSeconds(getValue() as number)}
      </span>
    ),
  } as ColumnDef<T>
}

/** Column showing the billable amount with currency formatting, or nothing when view is hidden. */
export function createBillableAmountColumn<
  T extends { billableAmount: number },
>(canViewBillable: boolean, currency: string): ColumnDef<T>[] {
  if (!canViewBillable) return []
  return [
    {
      accessorKey: 'billableAmount',
      header: 'Billable Amount',
      cell: ({ getValue }) => {
        const amount = getValue() as number
        return (
          <span className="text-sm tabular-nums text-muted-foreground">
            {amount === 0 ? '—' : formatCurrency(amount, currency)}
          </span>
        )
      },
    } as ColumnDef<T>,
  ]
}

/** Column with the edit/archive/activate actions dropdown menu. */
export function createActionsColumn<T extends { id: string }>(
  canManage: boolean,
  options: {
    archivingId: string | null
    /** Called to determine if the item is currently active. */
    isActive: (item: T) => boolean
    onEdit: (item: T) => void
    handleArchive: (item: T) => void
    handleActivate: (item: T) => void
  },
): ColumnDef<T>[] {
  if (!canManage) return []
  return [
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const item = row.original
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={options.archivingId === item.id}
                className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                aria-label="Row actions"
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => options.onEdit(item)}>
                  <Pencil className="mr-2 size-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {options.isActive(item) ? (
                  <DropdownMenuItem
                    onClick={() => options.handleArchive(item)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Archive className="mr-2 size-4" />
                    Archive
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => options.handleActivate(item)}
                  >
                    <CheckCircle className="mr-2 size-4" />
                    Activate
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    } as ColumnDef<T>,
  ]
}
