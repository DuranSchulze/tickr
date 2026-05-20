import { useMemo, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { createColumnHelper } from '@tanstack/react-table'
import { gooeyToast } from 'goey-toast'
import { Pencil, Trash2 } from 'lucide-react'
import { deleteCohortFn } from '#/lib/server/tracker'
import type {
  PaginatedCohort,
  PaginatedCohortsResult,
} from '#/lib/server/tracker/catalogs/paginated.server'
import {
  CatalogFormDialog,
  CatalogSearchBar,
  CatalogTablePage,
} from './CatalogTableLayout'
import { CohortForm } from './CohortForm'
import { EditCohortForm } from './EditCohortForm'

const col = createColumnHelper<PaginatedCohort>()

interface Props {
  data: PaginatedCohortsResult
  page: number
  pageSize: number
  search: string
  departmentFilter: string
  canManage: boolean
  onFilterChange: (updates: Record<string, string | undefined>) => void
  onPageChange: (page: number) => void
}

export function CohortsTablePage({
  data,
  page,
  pageSize,
  search,
  departmentFilter,
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
                      className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={deletingId === cohort.id}
                      onClick={() => handleDelete(cohort)}
                      className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
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
    <div className="flex flex-wrap items-center gap-3 w-full">
      <div className="w-full max-w-xs">
        <CatalogSearchBar
          value={search}
          onChange={(v) => onFilterChange({ search: v || undefined })}
          placeholder="Search groups…"
        />
      </div>
      <select
        value={departmentFilter}
        onChange={(e) =>
          onFilterChange({ departmentId: e.target.value || undefined })
        }
        className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <option value="">All departments</option>
        {data.departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
    </div>
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
          search || departmentFilter
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
