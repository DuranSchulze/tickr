// oxlint-disable-next-line react/only-export-components — utility functions and hooks in a .tsx file
import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { gooeyToast } from '#/lib/toast'
import { Archive, CheckCircle, MoreHorizontal, Pencil } from 'lucide-react'
import { formatCurrency } from '#/lib/time-tracker/billing'
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
            : 'bg-smoke'
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
        <span className="text-sm tabular-nums text-smoke">
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
      <span className="text-sm tabular-nums text-smoke">
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
          <span className="text-sm tabular-nums text-smoke">
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
                className="grid size-8 place-items-center rounded-full text-smoke transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
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
