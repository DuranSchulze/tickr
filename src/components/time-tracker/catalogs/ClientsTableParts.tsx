import { useMemo } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import {
  Archive,
  CheckCircle,
  MoreHorizontal,
  PauseCircle,
  Pencil,
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
  onView,
  onEdit,
  onArchive,
  onActivate,
  onSuspend,
}: {
  canManage: boolean
  canViewBillable: boolean
  currency: string
  archivingId: string | null
  onView: (client: PaginatedClient) => void
  onEdit: (client: PaginatedClient) => void
  onArchive: (client: PaginatedClient) => void
  onActivate: (client: PaginatedClient) => void
  onSuspend: (client: PaginatedClient) => void
}) {
  return useMemo(
    () => [
      col.accessor('name', {
        header: 'Name',
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => onView(row.original)}
            className="font-semibold text-foreground no-underline hover:text-primary"
          >
            {row.original.name}
          </button>
        ),
      }),
      col.accessor('clientStatus', {
        header: 'Status',
        cell: ({ getValue }) => {
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
      }),
      col.accessor('totalSeconds', {
        header: 'Total Hours',
        cell: ({ getValue }) => (
          <span className="text-sm tabular-nums text-smoke">
            {formatSeconds(getValue())}
          </span>
        ),
      }),
      ...(canViewBillable
        ? [
            col.accessor('defaultBillableRate', {
              header: 'Default Rate',
              cell: ({ getValue }) => {
                const amount = getValue()
                return (
                  <span className="text-sm tabular-nums text-smoke">
                    {amount == null
                      ? 'Workspace/member fallback'
                      : formatCurrency(amount, currency)}
                  </span>
                )
              },
            }),
            col.accessor('billableAmount', {
              header: 'Billable Amount',
              cell: ({ getValue }) => {
                const amount = getValue()
                return (
                  <span className="text-sm tabular-nums text-smoke">
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
                        className="grid size-8 place-items-center rounded-full text-smoke transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
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
                        {client.clientStatus === 'ACTIVE' && (
                          <>
                            <DropdownMenuItem
                              onClick={() => onSuspend(client)}
                              className="text-amber-600 focus:text-amber-600"
                            >
                              <PauseCircle className="mr-2 size-4" />
                              Suspend
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onArchive(client)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Archive className="mr-2 size-4" />
                              Archive
                            </DropdownMenuItem>
                          </>
                        )}
                        {client.clientStatus === 'SUSPENDED' && (
                          <>
                            <DropdownMenuItem
                              onClick={() => onActivate(client)}
                            >
                              <CheckCircle className="mr-2 size-4" />
                              Activate
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onArchive(client)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Archive className="mr-2 size-4" />
                              Archive
                            </DropdownMenuItem>
                          </>
                        )}
                        {client.clientStatus === 'INACTIVE' && (
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
      onView,
      onEdit,
      onArchive,
      onActivate,
      onSuspend,
    ],
  )
}
