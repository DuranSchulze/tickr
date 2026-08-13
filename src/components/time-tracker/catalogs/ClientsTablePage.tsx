import { useCallback, useReducer } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Check, PauseCircle, X } from 'lucide-react'
import { gooeyToast } from '#/lib/toast'
import {
  activateClientFn,
  archiveClientFn,
  bulkActivateClientsFn,
  bulkArchiveClientsFn,
  bulkSuspendClientsFn,
  suspendClientFn,
} from '#/lib/server/tracker'
import {
  ensureCatalogTabsFn,
  syncCatalogsWithSheetFn,
} from '#/lib/server/gsheets/sync'
import type { PaginatedClient } from '#/lib/server/tracker/catalogs/paginated.server'
import {
  CatalogFilterBar,
  CatalogFormDialog,
  CatalogTablePage,
} from './CatalogTableLayout'
import { ClientForm } from './ClientForm'
import { EditClientForm } from './EditClientForm'
import { SyncSheetDialog } from './SyncSheetDialog'
import { ClientSheetMenu, useClientColumns } from './ClientsTableParts'
import { useTaskSyncPublisher } from '../TaskSyncCoordinator'

interface Props {
  data: {
    items: PaginatedClient[]
    totalCount: number
    totalPages: number
  }
  page: number
  pageSize: number
  appliedFilters: {
    search: string
    status: string
    sort: string
  }
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
  appliedFilters,
  canManage,
  canImportSheet,
  canViewBillable,
  currency,
  googleSheetUrl,
  onFilterChange,
  onPageChange,
}: Props) {
  const router = useRouter()
  const publishTaskChange = useTaskSyncPublisher()
  const [local, dispatch] = useReducer(
    (
      s: {
        showCreate: boolean
        editingClient: PaginatedClient | null
        archivingId: string | null
        sheetLoading: boolean
        showSyncDialog: boolean
      },
      a: Partial<typeof s>,
    ) => ({ ...s, ...a }),
    {
      showCreate: false,
      editingClient: null,
      archivingId: null,
      sheetLoading: false,
      showSyncDialog: false,
    },
  )
  const {
    showCreate,
    editingClient,
    archivingId,
    sheetLoading,
    showSyncDialog,
  } = local

  const handleArchive = useCallback(
    async (client: PaginatedClient) => {
      dispatch({ archivingId: client.id })
      try {
        await archiveClientFn({ data: { id: client.id } })
        await router.invalidate()
        publishTaskChange()
        gooeyToast.success(`"${client.name}" archived`)
      } catch (err) {
        gooeyToast.error('Failed to archive', {
          description: err instanceof Error ? err.message : 'Please try again.',
        })
      } finally {
        dispatch({ archivingId: null })
      }
    },
    [publishTaskChange, router],
  )

  const handleActivate = useCallback(
    async (client: PaginatedClient) => {
      dispatch({ archivingId: client.id })
      try {
        await activateClientFn({ data: { id: client.id } })
        await router.invalidate()
        publishTaskChange()
        gooeyToast.success(`"${client.name}" activated`)
      } catch (err) {
        gooeyToast.error('Failed to activate', {
          description: err instanceof Error ? err.message : 'Please try again.',
        })
      } finally {
        dispatch({ archivingId: null })
      }
    },
    [publishTaskChange, router],
  )

  const handleSuspend = useCallback(
    async (client: PaginatedClient) => {
      dispatch({ archivingId: client.id })
      try {
        await suspendClientFn({ data: { id: client.id } })
        await router.invalidate()
        publishTaskChange()
        gooeyToast.success(`"${client.name}" suspended`)
      } catch (err) {
        gooeyToast.error('Failed to suspend', {
          description: err instanceof Error ? err.message : 'Please try again.',
        })
      } finally {
        dispatch({ archivingId: null })
      }
    },
    [publishTaskChange, router],
  )

  const handleEdit = useCallback(
    (client: PaginatedClient) => dispatch({ editingClient: client }),
    [],
  )

  async function handleSync() {
    dispatch({ sheetLoading: true })
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
      dispatch({ sheetLoading: false })
    }
  }

  async function handleSetupSheetTab() {
    dispatch({ sheetLoading: true })
    try {
      await ensureCatalogTabsFn()
      gooeyToast.success('Sheet tab ready')
    } catch (err) {
      gooeyToast.error('Setup failed', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      dispatch({ sheetLoading: false })
    }
  }

  const columns = useClientColumns({
    canManage,
    canViewBillable,
    currency,
    archivingId,
    onEdit: handleEdit,
    onArchive: handleArchive,
    onActivate: handleActivate,
    onSuspend: handleSuspend,
  })

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
        onCreate={() => dispatch({ showCreate: true })}
        createLabel="New Client"
        headerActions={
          <ClientSheetMenu
            canImportSheet={canImportSheet}
            canManage={canManage}
            sheetLoading={sheetLoading}
            googleSheetUrl={googleSheetUrl}
            onImport={() => dispatch({ showSyncDialog: true })}
            onSyncAll={handleSync}
            onSetupTab={handleSetupSheetTab}
          />
        }
        toolbar={
          <CatalogFilterBar
            searchPlaceholder="Search clients…"
            appliedValues={appliedFilters}
            onApply={onFilterChange}
            filters={[
              {
                key: 'status',
                label: 'Status',
                options: [
                  { value: '', label: 'All statuses' },
                  { value: 'ACTIVE', label: 'Active' },
                  { value: 'SUSPENDED', label: 'Suspended' },
                  { value: 'INACTIVE', label: 'Inactive' },
                ],
              },
              {
                key: 'sort',
                label: 'Sort',
                defaultValue: 'name_asc',
                options: [
                  { value: 'name_asc', label: 'Name A–Z' },
                  { value: 'name_desc', label: 'Name Z–A' },
                ],
              },
            ]}
          />
        }
        emptyMessage={
          appliedFilters.search || appliedFilters.status
            ? 'No clients match your filters.'
            : 'No clients yet. Add your first client to get started.'
        }
        getRowId={(client) => client.id}
        bulkActions={[
          {
            value: 'activate',
            label: 'Activate',
            icon: <Check className="size-4 text-emerald-500" />,
            className:
              'border-border bg-background text-foreground hover:bg-accent',
          },
          {
            value: 'suspend',
            label: 'Suspend',
            icon: <PauseCircle className="size-4" />,
            className:
              'border-amber-500/40 bg-background text-amber-700 hover:bg-amber-500/10',
          },
          {
            value: 'archive',
            label: 'Inactive',
            icon: <X className="size-4" />,
            className:
              'border-destructive/40 bg-background text-destructive hover:bg-destructive/10',
          },
        ]}
        onBulkAction={async (action, ids) => {
          if (action === 'activate') {
            await bulkActivateClientsFn({ data: { ids } })
          } else if (action === 'suspend') {
            await bulkSuspendClientsFn({ data: { ids } })
          } else {
            await bulkArchiveClientsFn({ data: { ids } })
          }
          await router.invalidate()
          publishTaskChange()
          const label =
            action === 'activate'
              ? 'activated'
              : action === 'suspend'
                ? 'suspended'
                : 'marked inactive'
          gooeyToast.success(
            `${ids.length} client${ids.length === 1 ? '' : 's'} ${label}`,
          )
        }}
      />

      <CatalogFormDialog
        title="New Client"
        open={showCreate}
        onClose={() => dispatch({ showCreate: false })}
      >
        <ClientForm
          currency={currency}
          onSuccess={async () => {
            dispatch({ showCreate: false })
            await router.invalidate()
          }}
        />
      </CatalogFormDialog>

      <CatalogFormDialog
        title={editingClient ? `Edit "${editingClient.name}"` : ''}
        open={!!editingClient}
        onClose={() => dispatch({ editingClient: null })}
      >
        {editingClient && (
          <EditClientForm
            client={editingClient}
            currency={currency}
            onDone={async () => {
              dispatch({ editingClient: null })
              await router.invalidate()
            }}
          />
        )}
      </CatalogFormDialog>

      <SyncSheetDialog
        open={showSyncDialog}
        onComplete={publishTaskChange}
        onClose={async () => {
          dispatch({ showSyncDialog: false })
          await router.invalidate()
        }}
        type="clients"
      />
    </>
  )
}
