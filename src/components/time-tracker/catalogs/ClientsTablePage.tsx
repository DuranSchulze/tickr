import { useCallback, useReducer, useState } from 'react'
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
import type { PaginatedClient } from '#/lib/server/tracker/catalogs/paginated.server'
import {
  CatalogFilterBar,
  CatalogFormDialog,
  CatalogTablePage,
} from './CatalogTableLayout'
import { ClientDetailsDialog } from './ClientDetailsDialog'
import { ClientForm } from './ClientForm'
import { EditClientForm } from './EditClientForm'
import { useClientColumns } from './ClientsTableParts'
import { useTaskSyncPublisher } from '../TaskSyncCoordinator'

interface Props {
  workspaceId: string
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
  canViewBillable: boolean
  currency: string
  onFilterChange: (updates: Record<string, string | undefined>) => void
  onPageChange: (page: number) => void
}

export function ClientsTablePage({
  workspaceId,
  data,
  page,
  pageSize,
  appliedFilters,
  canManage,
  canViewBillable,
  currency,
  onFilterChange,
  onPageChange,
}: Props) {
  const [viewingClient, setViewingClient] = useState<PaginatedClient | null>(
    null,
  )
  const router = useRouter()
  const publishTaskChange = useTaskSyncPublisher()
  const [local, dispatch] = useReducer(
    (
      s: {
        showCreate: boolean
        editingClient: PaginatedClient | null
        archivingId: string | null
      },
      a: Partial<typeof s>,
    ) => ({ ...s, ...a }),
    {
      showCreate: false,
      editingClient: null,
      archivingId: null,
    },
  )
  const { showCreate, editingClient, archivingId } = local

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

  const columns = useClientColumns({
    canManage,
    canViewBillable,
    currency,
    archivingId,
    onView: setViewingClient,
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
              'border-stone bg-eggshell text-foreground hover:bg-accent',
          },
          {
            value: 'suspend',
            label: 'Suspend',
            icon: <PauseCircle className="size-4" />,
            className:
              'border-amber-500/40 bg-eggshell text-amber-700 hover:bg-amber-500/10',
          },
          {
            value: 'archive',
            label: 'Inactive',
            icon: <X className="size-4" />,
            className:
              'border-destructive/40 bg-eggshell text-destructive hover:bg-destructive/10',
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

      {viewingClient && (
        <ClientDetailsDialog
          key={viewingClient.id}
          client={viewingClient}
          canManage={canManage}
          workspaceId={workspaceId}
          onClose={() => setViewingClient(null)}
        />
      )}

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
    </>
  )
}
