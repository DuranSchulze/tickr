import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from 'goey-toast'
import { deleteDepartmentFn } from '#/lib/server/tracker'
import type { TrackerState } from '#/lib/time-tracker/types'
import {
  CatalogName,
  ColorDot,
  DangerButton,
  EditButton,
  EditPanel,
  EmptyCatalog,
  ListRow,
  SelectionBar,
} from './CatalogListParts'
import { EditDepartmentForm } from './EditDepartmentForm'
import { useCatalogListSelection } from './useCatalogListSelection'

export function DepartmentList({
  departments,
  canManage,
}: {
  departments: TrackerState['departments']
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

  async function handleBulkDelete() {
    setBulkDeleting(true)
    const ids = [...selectedIds]
    const results = await Promise.allSettled(
      ids.map((id) => deleteDepartmentFn({ data: { id } })),
    )
    await router.invalidate()
    const succeeded = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.filter((r) => r.status === 'rejected').length
    if (succeeded > 0)
      gooeyToast.success(
        `${succeeded} department${succeeded > 1 ? 's' : ''} deleted${failed > 0 ? `, ${failed} failed` : ''}`,
      )
    else gooeyToast.error('Could not delete departments')
    clearSelection()
    setBulkDeleting(false)
  }

  if (departments.length === 0)
    return <EmptyCatalog label="No departments yet." />

  return (
    <div className="grid gap-2">
      {canManage && (
        <SelectionBar
          total={departments.length}
          selectedCount={selectedIds.size}
          onToggleAll={() => toggleAll(departments.map((d) => d.id))}
          onBulkDelete={handleBulkDelete}
          deleting={bulkDeleting}
        />
      )}
      {departments.map((department) =>
        editingId === department.id ? (
          <EditPanel
            key={department.id}
            title={`Editing "${department.name}"`}
            onClose={() => setEditingId(null)}
          >
            <EditDepartmentForm
              department={department}
              onDone={() => setEditingId(null)}
            />
          </EditPanel>
        ) : (
          <ListRow key={department.id}>
            {canManage && (
              <input
                type="checkbox"
                checked={selectedIds.has(department.id)}
                onChange={() => toggleSelect(department.id)}
                className="h-4 w-4 shrink-0 accent-primary"
              />
            )}
            <ColorDot color={department.color} />
            <CatalogName name={department.name} />
            {canManage && (
              <>
                <EditButton onClick={() => setEditingId(department.id)} />
                <DangerButton
                  title="Delete department"
                  pending={pendingId === department.id}
                  onClick={async () => {
                    setPendingId(department.id)
                    try {
                      await deleteDepartmentFn({
                        data: { id: department.id },
                      })
                      await router.invalidate()
                      gooeyToast.success(`"${department.name}" deleted`)
                    } finally {
                      setPendingId(null)
                    }
                  }}
                />
              </>
            )}
          </ListRow>
        ),
      )}
    </div>
  )
}
