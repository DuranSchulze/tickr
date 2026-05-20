import { useMemo, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { createColumnHelper } from '@tanstack/react-table'
import { gooeyToast } from 'goey-toast'
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
import {
  activateClientFn,
  archiveClientFn,
  bulkActivateClientsFn,
  bulkArchiveClientsFn,
} from '#/lib/server/tracker'
import {
  ensureCatalogTabsFn,
  syncCatalogsWithSheetFn,
} from '#/lib/server/gsheets/sync'
import type { PaginatedClient } from '#/lib/server/tracker/catalogs/paginated.server'
import { formatCurrency } from '#/lib/time-tracker/billing'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  CatalogFormDialog,
  CatalogSearchBar,
  CatalogTablePage,
} from './CatalogTableLayout'
import { ClientForm } from './ClientForm'
import { EditClientForm } from './EditClientForm'
import { SyncSheetDialog } from './SyncSheetDialog'

function formatSeconds(seconds: number): string {
  if (seconds === 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

const col = createColumnHelper<PaginatedClient>()

interface Props {
  data: {
    items: PaginatedClient[]
    totalCount: number
    totalPages: number
  }
  page: number
  pageSize: number
  search: string
  statusFilter: string
  canManage: boolean
  canImportSheet: boolean
  canViewBillable: boolean
  currency: string
  googleSheetUrl: string | null
  onFilterChange: (updates: Record<string, string | undefined>) => void
  onPageChange: (page: number) => void
}

export function ClientsTablePage({
  data,
  page,
  pageSize,
  search,
  statusFilter,
  canManage,
  canImportSheet,
  canViewBillable,
  currency,
  googleSheetUrl,
  onFilterChange,
  onPageChange,
}: Props) {
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)
  const [editingClient, setEditingClient] = useState<PaginatedClient | null>(
    null,
  )
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [sheetLoading, setSheetLoading] = useState(false)
  const [showSyncDialog, setShowSyncDialog] = useState(false)

  async function handleArchive(client: PaginatedClient) {
    setArchivingId(client.id)
    try {
      await archiveClientFn({ data: { id: client.id } })
      await router.invalidate()
      gooeyToast.success(`"${client.name}" archived`)
    } catch (err) {
      gooeyToast.error('Failed to archive', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setArchivingId(null)
    }
  }

  async function handleActivate(client: PaginatedClient) {
    setArchivingId(client.id)
    try {
      await activateClientFn({ data: { id: client.id } })
      await router.invalidate()
      gooeyToast.success(`"${client.name}" activated`)
    } catch (err) {
      gooeyToast.error('Failed to activate', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setArchivingId(null)
    }
  }

  async function handleSync() {
    setSheetLoading(true)
    try {
      const result = await syncCatalogsWithSheetFn()
      await router.invalidate()
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

  const columns = useMemo(
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
                className={`h-1.5 w-1.5 rounded-full ${
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
                        className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                        aria-label="Row actions"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setEditingClient(client)}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {client.clientStatus === 'ACTIVE' ? (
                          <DropdownMenuItem
                            onClick={() => handleArchive(client)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Archive className="mr-2 h-4 w-4" />
                            Archive
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => handleActivate(client)}
                          >
                            <CheckCircle className="mr-2 h-4 w-4" />
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
    [canManage, canViewBillable, currency, archivingId],
  )

  const sheetButton = canImportSheet ? (
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
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <FileSpreadsheet className="h-4 w-4" aria-hidden />
        )}
        Sheet
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleImportFromSheet}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Sync from Sheet
        </DropdownMenuItem>
        {canManage && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSync}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Sync all catalogs
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSetupSheetTab}>
              <TableIcon className="mr-2 h-4 w-4" />
              Setup Sheet Tab
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3 w-full">
      <div className="w-full max-w-xs">
        <CatalogSearchBar
          value={search}
          onChange={(v) => onFilterChange({ search: v || undefined })}
          placeholder="Search clients…"
        />
      </div>
      <select
        value={statusFilter}
        onChange={(e) =>
          onFilterChange({ status: e.target.value || undefined })
        }
        className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <option value="">All statuses</option>
        <option value="ACTIVE">Active</option>
        <option value="INACTIVE">Inactive</option>
      </select>
    </div>
  )

  return (
    <>
      <CatalogTablePage
        title="Clients"
        description="Customers and accounts that own one or more projects."
        data={data.items}
        columns={columns}
        totalCount={data.totalCount}
        totalPages={data.totalPages}
        page={page}
        pageSize={pageSize}
        onPageChange={onPageChange}
        canManage={canManage}
        onCreate={() => setShowCreate(true)}
        createLabel="New Client"
        headerActions={sheetButton}
        toolbar={toolbar}
        emptyMessage={
          search || statusFilter
            ? 'No clients match your filters.'
            : 'No clients yet. Add your first client to get started.'
        }
        getRowId={(client) => client.id}
        onBulkAction={async (action, ids) => {
          if (action === 'activate') {
            await bulkActivateClientsFn({ data: { ids } })
          } else {
            await bulkArchiveClientsFn({ data: { ids } })
          }
          await router.invalidate()
          gooeyToast.success(
            `${ids.length} client${ids.length === 1 ? '' : 's'} ${action === 'activate' ? 'activated' : 'archived'}`,
          )
        }}
      />

      <CatalogFormDialog
        title="New Client"
        open={showCreate}
        onClose={() => setShowCreate(false)}
      >
        <ClientForm
          onSuccess={async () => {
            setShowCreate(false)
            await router.invalidate()
          }}
        />
      </CatalogFormDialog>

      <CatalogFormDialog
        title={editingClient ? `Edit "${editingClient.name}"` : ''}
        open={!!editingClient}
        onClose={() => setEditingClient(null)}
      >
        {editingClient && (
          <EditClientForm
            client={editingClient}
            onDone={async () => {
              setEditingClient(null)
              await router.invalidate()
            }}
          />
        )}
      </CatalogFormDialog>

      <SyncSheetDialog
        open={showSyncDialog}
        onClose={async () => {
          setShowSyncDialog(false)
          await router.invalidate()
        }}
        type="clients"
      />
    </>
  )
}
