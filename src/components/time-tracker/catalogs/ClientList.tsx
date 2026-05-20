import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from 'goey-toast'
import { archiveClientFn } from '#/lib/server/tracker'
import type { TrackerState } from '#/lib/time-tracker/types'
import {
  DangerButton,
  EditButton,
  EditPanel,
  EmptyCatalog,
  ListRow,
  SelectionBar,
} from './CatalogListParts'
import { EditClientForm } from './EditClientForm'
import { useCatalogListSelection } from './useCatalogListSelection'

export function ClientList({
  clients,
  canManage,
}: {
  clients: TrackerState['clients']
  canManage: boolean
}) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const {
    selectedIds,
    bulkDeleting,
    setBulkDeleting,
    toggleSelect,
    toggleAll,
    clearSelection,
  } = useCatalogListSelection()

  const activeClients = clients.filter((c) => c.clientStatus === 'ACTIVE')

  async function handleBulkDelete() {
    setBulkDeleting(true)
    const ids = [...selectedIds]
    const results = await Promise.allSettled(
      ids.map((id) => archiveClientFn({ data: { id } })),
    )
    await router.invalidate()
    const succeeded = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.filter((r) => r.status === 'rejected').length
    if (succeeded > 0)
      gooeyToast.success(
        `${succeeded} client${succeeded > 1 ? 's' : ''} archived${failed > 0 ? `, ${failed} failed` : ''}`,
      )
    else gooeyToast.error('Could not archive clients')
    clearSelection()
    setBulkDeleting(false)
  }

  if (clients.length === 0) return <EmptyCatalog label="No clients yet." />

  return (
    <div className="grid gap-2">
      {canManage && (
        <SelectionBar
          total={activeClients.length}
          selectedCount={selectedIds.size}
          onToggleAll={() => toggleAll(activeClients.map((c) => c.id))}
          onBulkDelete={handleBulkDelete}
          deleting={bulkDeleting}
        />
      )}
      {clients.map((client) =>
        editingId === client.id ? (
          <EditPanel
            key={client.id}
            title={`Editing "${client.name}"`}
            onClose={() => setEditingId(null)}
          >
            <EditClientForm client={client} onDone={() => setEditingId(null)} />
          </EditPanel>
        ) : (
          <ListRow key={client.id}>
            {canManage && client.clientStatus === 'ACTIVE' && (
              <input
                type="checkbox"
                checked={selectedIds.has(client.id)}
                onChange={() => toggleSelect(client.id)}
                className="h-4 w-4 shrink-0 accent-primary"
              />
            )}
            {canManage && client.clientStatus !== 'ACTIVE' && (
              <span className="h-4 w-4 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-sm font-bold text-foreground">
                {client.name}
              </p>
              <p className="m-0 text-xs text-muted-foreground">
                {client.clientStatus === 'ACTIVE' ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                    Inactive
                  </span>
                )}
              </p>
            </div>
            {canManage && (
              <>
                <EditButton onClick={() => setEditingId(client.id)} />
                {client.clientStatus === 'ACTIVE' && (
                  <DangerButton
                    title="Archive client"
                    pending={pendingId === client.id}
                    onClick={async () => {
                      setPendingId(client.id)
                      try {
                        await archiveClientFn({ data: { id: client.id } })
                        await router.invalidate()
                        gooeyToast.success(`"${client.name}" archived`)
                      } finally {
                        setPendingId(null)
                      }
                    }}
                  />
                )}
              </>
            )}
          </ListRow>
        ),
      )}
    </div>
  )
}
