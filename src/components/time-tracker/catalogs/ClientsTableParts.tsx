import { useMemo } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
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
import type { PaginatedClient } from '#/lib/server/tracker/catalogs/paginated.server'
import { formatCurrency } from '#/lib/time-tracker/billing'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'

function formatSeconds(seconds: number): string {
  if (seconds === 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

const col = createColumnHelper<PaginatedClient>()

/** Builds the Clients table column set, including the optional billable and
 *  row-actions columns gated on the caller's permissions. */
export function useClientColumns({
  canManage,
  canViewBillable,
  currency,
  archivingId,
  onEdit,
  onArchive,
  onActivate,
}: {
  canManage: boolean
  canViewBillable: boolean
  currency: string
  archivingId: string | null
  onEdit: (client: PaginatedClient) => void
  onArchive: (client: PaginatedClient) => void
  onActivate: (client: PaginatedClient) => void
}) {
  return useMemo(
    () => [
      col.accessor('name', {
        header: 'Name',
        cell: ({ getValue }) => (
          <span className="font-semibold text-foreground">{getValue()}</span>
        ),
      }),
      col.accessor('clientStatus', {
        header: 'Status',
        cell: ({ getValue }) => {
          const status = getValue()
          return (
            <span className="inline-flex items-center gap-1.5 text-sm">
              <span
                className={`size-1.5 rounded-full ${
                  status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-muted-foreground'
                }`}
              />
              {status === 'ACTIVE' ? 'Active' : 'Inactive'}
            </span>
          )
        },
      }),
      col.accessor('totalSeconds', {
        header: 'Total Hours',
        cell: ({ getValue }) => (
          <span className="text-sm tabular-nums text-muted-foreground">
            {formatSeconds(getValue())}
          </span>
        ),
      }),
      ...(canViewBillable
        ? [
            col.accessor('billableAmount', {
              header: 'Billable Amount',
              cell: ({ getValue }) => {
                const amount = getValue()
                return (
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {amount === 0 ? '—' : formatCurrency(amount, currency)}
                  </span>
                )
              },
            }),
          ]
        : []),
      ...(canManage
        ? [
            col.display({
              id: 'actions',
              header: '',
              cell: ({ row }) => {
                const client = row.original
                return (
                  <div className="flex justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        disabled={archivingId === client.id}
                        className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                        aria-label="Row actions"
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(client)}>
                          <Pencil className="mr-2 size-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {client.clientStatus === 'ACTIVE' ? (
                          <DropdownMenuItem
                            onClick={() => onArchive(client)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Archive className="mr-2 size-4" />
                            Archive
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => onActivate(client)}>
                            <CheckCircle className="mr-2 size-4" />
                            Activate
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )
              },
            }),
          ]
        : []),
    ],
    [
      canManage,
      canViewBillable,
      currency,
      archivingId,
      onEdit,
      onArchive,
      onActivate,
    ],
  )
}

/** Google Sheet import/sync menu shown in the Clients table header. */
export function ClientSheetMenu({
  canImportSheet,
  canManage,
  sheetLoading,
  googleSheetUrl,
  onImport,
  onSyncAll,
  onSetupTab,
}: {
  canImportSheet: boolean
  canManage: boolean
  sheetLoading: boolean
  googleSheetUrl: string | null
  onImport: () => void
  onSyncAll: () => void
  onSetupTab: () => void
}) {
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
        <DropdownMenuItem onClick={onImport}>
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
