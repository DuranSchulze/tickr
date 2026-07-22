import { useMemo, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { createColumnHelper } from '@tanstack/react-table'
import { gooeyToast } from '#/lib/toast'
import { Pencil, Trash2 } from 'lucide-react'
import { deleteCohortFn } from '#/lib/server/tracker'
import type {
  PaginatedCohort,
  PaginatedCohortsResult,
} from '#/lib/server/tracker/catalogs/paginated.server'
import {
  CatalogFilterBar,
  CatalogFormDialog,
  CatalogTablePage,
} from './CatalogTableLayout'
import { CohortForm } from './CohortForm'
import { EditCohortForm } from './EditCohortForm'

const col = createColumnHelper<PaginatedCohort>()

interface Props {
  data: PaginatedCohortsResult
  page: number
  pageSize: number
  appliedFilters: {
    search: string
    departmentId: string
    sort: string
  }
  canManage: boolean
  onFilterChange: (updates: Record<string, string | undefined>) => void
  onPageChange: (page: number) => void
}

export function CohortsTablePage({
  data,
  page,
  pageSize,
  appliedFilters,
  canManage,
  onFilterChange,
  onPageChange,
}: Props) {
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)
  const [editingCohort, setEditingCohort] = useState<PaginatedCohort | null>(
    null,
  )
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleDelete(cohort: PaginatedCohort) {
    if (!confirm(`Delete group "${cohort.name}"? This cannot be undone.`))
      return
    setDeletingId(cohort.id)
    try {
      await deleteCohortFn({ data: { id: cohort.id } })
      await router.invalidate()
      gooeyToast.success(`"${cohort.name}" deleted`)
    } catch (err) {
      gooeyToast.error('Failed to delete', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setDeletingId(null)
    }
  }

  const columns = useMemo(
    () => [
      col.accessor('name', {
        header: 'Name',
        cell: ({ getValue }) => (
          <span className="font-semibold text-foreground">{getValue()}</span>
        ),
      }),
      col.accessor('departmentName', {
        header: 'Department',
        cell: ({ getValue }) => (
          <span className="text-sm text-muted-foreground">{getValue()}</span>
        ),
      }),
      ...(canManage
        ? [
            col.display({
              id: 'actions',
              header: '',
              cell: ({ row }) => {
                const cohort = row.original
                return (
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingCohort(cohort)}
                      className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                      title="Edit"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={deletingId === cohort.id}
                      onClick={() => handleDelete(cohort)}
                      className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )
              },
            }),
          ]
        : []),
    ],
    [canManage, deletingId],
  )

  // Adapt departments for form component (expects { description, color })
  const deptsForForm = data.departments.map((d) => ({
    ...d,
    description: '',
    color: d.color,
  }))

  // Adapt editing cohort for EditCohortForm (expects { departmentId })
  const editingForForm = editingCohort
    ? {
        id: editingCohort.id,
        name: editingCohort.name,
        departmentId: editingCohort.departmentId,
      }
    : null

  const toolbar = (
    <CatalogFilterBar
      searchPlaceholder="Search groups…"
      appliedValues={appliedFilters}
      onApply={onFilterChange}
      filters={[
        {
          key: 'departmentId',
          label: 'Department',
          searchable: true,
          searchPlaceholder: 'Search departments…',
          options: [
            { value: '', label: 'All departments' },
            ...data.departments.map((d) => ({ value: d.id, label: d.name })),
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
  )

  return (
    <>
      <CatalogTablePage
        title="Groups / Cohorts"
        description="Teams inside departments for finer member filtering."
        data={data.items}
        columns={columns}
        totalCount={data.totalCount}
        totalPages={data.totalPages}
        page={page}
        pageSize={pageSize}
        onPageChange={onPageChange}
        canManage={canManage}
        onCreate={() => setShowCreate(true)}
        createLabel="New Group"
        toolbar={toolbar}
        emptyMessage={
          appliedFilters.search || appliedFilters.departmentId
            ? 'No groups match your filters.'
            : 'No groups yet. Add your first group to get started.'
        }
      />

      <CatalogFormDialog
        title="New Group"
        open={showCreate}
        onClose={() => setShowCreate(false)}
      >
        <CohortForm
          departments={deptsForForm}
          onSuccess={async () => {
            setShowCreate(false)
            await router.invalidate()
          }}
        />
      </CatalogFormDialog>

      <CatalogFormDialog
        title={editingCohort ? `Edit "${editingCohort.name}"` : ''}
        open={!!editingCohort}
        onClose={() => setEditingCohort(null)}
      >
        {editingForForm && (
          <EditCohortForm
            cohort={editingForForm}
            departments={deptsForForm}
            onDone={async () => {
              setEditingCohort(null)
              await router.invalidate()
            }}
          />
        )}
      </CatalogFormDialog>
    </>
  )
}
