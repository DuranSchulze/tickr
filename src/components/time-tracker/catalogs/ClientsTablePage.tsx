import { useCallback, useReducer } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from '#/lib/toast'
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
import { CatalogFormDialog, CatalogTablePage } from './CatalogTableLayout'
import { ClientForm } from './ClientForm'
import { EditClientForm } from './EditClientForm'
import { SyncSheetDialog } from './SyncSheetDialog'
import {
  ClientSheetMenu,
  ClientsToolbar,
  useClientColumns,
} from './ClientsTableParts'

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
        gooeyToast.success(`"${client.name}" archived`)
      } catch (err) {
        gooeyToast.error('Failed to archive', {
          description: err instanceof Error ? err.message : 'Please try again.',
        })
      } finally {
        dispatch({ archivingId: null })
      }
    },
    [router],
  )

  const handleActivate = useCallback(
    async (client: PaginatedClient) => {
      dispatch({ archivingId: client.id })
      try {
        await activateClientFn({ data: { id: client.id } })
        await router.invalidate()
        gooeyToast.success(`"${client.name}" activated`)
      } catch (err) {
        gooeyToast.error('Failed to activate', {
          description: err instanceof Error ? err.message : 'Please try again.',
        })
      } finally {
        dispatch({ archivingId: null })
      }
    },
    [router],
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
          <ClientsToolbar
            search={search}
            statusFilter={statusFilter}
            onFilterChange={onFilterChange}
          />
        }
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
        onClose={() => dispatch({ showCreate: false })}
      >
        <ClientForm
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
            onDone={async () => {
              dispatch({ editingClient: null })
              await router.invalidate()
            }}
          />
        )}
      </CatalogFormDialog>

      <SyncSheetDialog
        open={showSyncDialog}
        onClose={async () => {
          dispatch({ showSyncDialog: false })
          await router.invalidate()
        }}
        type="clients"
      />
    </>
  )
}
