import { useMemo, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from 'goey-toast'
import { deleteCohortFn } from '#/lib/server/tracker'
import type { TrackerState } from '#/lib/time-tracker/types'
import {
  DangerButton,
  EditButton,
  EditPanel,
  EmptyCatalog,
  ListRow,
  SelectionBar,
} from './CatalogListParts'
import { EditCohortForm } from './EditCohortForm'
import { useCatalogListSelection } from './useCatalogListSelection'

export function CohortList({
  cohorts,
  departments,
  canManage,
}: {
  cohorts: TrackerState['cohorts']
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

  const departmentsById = useMemo(
    () => new Map(departments.map((d) => [d.id, d.name])),
    [departments],
  )

  async function handleBulkDelete() {
    setBulkDeleting(true)
    const ids = [...selectedIds]
    const results = await Promise.allSettled(
      ids.map((id) => deleteCohortFn({ data: { id } })),
    )
    await router.invalidate()
    const succeeded = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.filter((r) => r.status === 'rejected').length
    if (succeeded > 0)
      gooeyToast.success(
        `${succeeded} cohort${succeeded > 1 ? 's' : ''} deleted${failed > 0 ? `, ${failed} failed` : ''}`,
      )
    else gooeyToast.error('Could not delete cohorts')
    clearSelection()
    setBulkDeleting(false)
  }

  if (cohorts.length === 0) return <EmptyCatalog label="No cohorts yet." />

  return (
    <div className="grid gap-2">
      {canManage && (
        <SelectionBar
          total={cohorts.length}
          selectedCount={selectedIds.size}
          onToggleAll={() => toggleAll(cohorts.map((c) => c.id))}
          onBulkDelete={handleBulkDelete}
          deleting={bulkDeleting}
        />
      )}
      {cohorts.map((cohort) =>
        editingId === cohort.id ? (
          <EditPanel
            key={cohort.id}
            title={`Editing "${cohort.name}"`}
            onClose={() => setEditingId(null)}
          >
            <EditCohortForm
              cohort={cohort}
              departments={departments}
              onDone={() => setEditingId(null)}
            />
          </EditPanel>
        ) : (
          <ListRow key={cohort.id}>
            {canManage && (
              <input
                type="checkbox"
                checked={selectedIds.has(cohort.id)}
                onChange={() => toggleSelect(cohort.id)}
                className="h-4 w-4 shrink-0 accent-primary"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-sm font-bold text-foreground">
                {cohort.name}
              </p>
              <p className="m-0 text-xs text-muted-foreground">
                {departmentsById.get(cohort.departmentId) ??
                  'Unassigned department'}
              </p>
            </div>
            {canManage && (
              <>
                <EditButton onClick={() => setEditingId(cohort.id)} />
                <DangerButton
                  title="Delete cohort"
                  pending={pendingId === cohort.id}
                  onClick={async () => {
                    setPendingId(cohort.id)
                    try {
                      await deleteCohortFn({ data: { id: cohort.id } })
                      await router.invalidate()
                      gooeyToast.success(`"${cohort.name}" deleted`)
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
