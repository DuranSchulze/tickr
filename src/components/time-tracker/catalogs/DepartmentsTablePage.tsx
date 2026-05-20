import { useMemo, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { createColumnHelper } from '@tanstack/react-table'
import { gooeyToast } from 'goey-toast'
import {
  FileSpreadsheet,
  Loader2,
  Pencil,
  RefreshCw,
  Table as TableIcon,
  Trash2,
} from 'lucide-react'
import { deleteDepartmentFn } from '#/lib/server/tracker'
import {
  ensureCatalogTabsFn,
  importDepartmentsFromSheetFn,
} from '#/lib/server/gsheets/sync'
import type { PaginatedDepartment } from '#/lib/server/tracker/catalogs/paginated.server'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  CatalogFormDialog,
  CatalogSearchBar,
  CatalogTablePage,
} from './CatalogTableLayout'
import { DepartmentForm } from './DepartmentForm'
import { EditDepartmentForm } from './EditDepartmentForm'
import { SyncSheetDialog } from './SyncSheetDialog'

const col = createColumnHelper<PaginatedDepartment>()

interface Props {
  data: {
    items: PaginatedDepartment[]
    totalCount: number
    totalPages: number
  }
  page: number
  pageSize: number
  search: string
  canManage: boolean
  canImportSheet: boolean
  googleSheetUrl: string | null
  onFilterChange: (updates: Record<string, string | undefined>) => void
  onPageChange: (page: number) => void
}

export function DepartmentsTablePage({
  data,
  page,
  pageSize,
  search,
  canManage,
  canImportSheet,
  googleSheetUrl,
  onFilterChange,
  onPageChange,
}: Props) {
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)
  const [editingDept, setEditingDept] = useState<PaginatedDepartment | null>(
    null,
  )
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [sheetLoading, setSheetLoading] = useState(false)
  const [showSyncDialog, setShowSyncDialog] = useState(false)

  async function handleImportFromSheet() {
    setSheetLoading(true)
    try {
      const result = await importDepartmentsFromSheetFn()
      await router.invalidate()
      gooeyToast.success(
        `Synced ${result.count} department${result.count !== 1 ? 's' : ''}`,
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

  async function handleDelete(dept: PaginatedDepartment) {
    if (!confirm(`Delete department "${dept.name}"? This cannot be undone.`))
      return
    setDeletingId(dept.id)
    try {
      await deleteDepartmentFn({ data: { id: dept.id } })
      await router.invalidate()
      gooeyToast.success(`"${dept.name}" deleted`)
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
        cell: ({ getValue, row }) => (
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-full border border-white/20"
              style={{ backgroundColor: row.original.color }}
            />
            <span className="font-semibold text-foreground">{getValue()}</span>
          </div>
        ),
      }),
      col.accessor('description', {
        header: 'Description',
        cell: ({ getValue }) => (
          <span className="text-sm text-muted-foreground">
            {getValue() || '—'}
          </span>
        ),
      }),
      ...(canManage
        ? [
            col.display({
              id: 'actions',
              header: '',
              cell: ({ row }) => {
                const dept = row.original
                return (
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingDept(dept)}
                      className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={deletingId === dept.id}
                      onClick={() => handleDelete(dept)}
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
        <DropdownMenuItem onClick={() => setShowSyncDialog(true)}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Sync from Sheet
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleImportFromSheet}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Quick Sync
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleSetupSheetTab}>
          <TableIcon className="mr-2 h-4 w-4" />
          Setup Sheet Tab
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3 w-full">
      <div className="w-full max-w-xs">
        <CatalogSearchBar
          value={search}
          onChange={(v) => onFilterChange({ search: v || undefined })}
          placeholder="Search departments…"
        />
      </div>
      {sheetButton}
    </div>
  )

  return (
    <>
      <CatalogTablePage
        title="Departments"
        description="Primary organizational units for members and cohorts."
        data={data.items}
        columns={columns}
        totalCount={data.totalCount}
        totalPages={data.totalPages}
        page={page}
        pageSize={pageSize}
        onPageChange={onPageChange}
        canManage={canManage}
        onCreate={() => setShowCreate(true)}
        createLabel="New Department"
        toolbar={toolbar}
        emptyMessage={
          search
            ? 'No departments match your search.'
            : 'No departments yet. Add your first department to get started.'
        }
      />

      <CatalogFormDialog
        title="New Department"
        open={showCreate}
        onClose={() => setShowCreate(false)}
      >
        <DepartmentForm
          onSuccess={async () => {
            setShowCreate(false)
            await router.invalidate()
          }}
        />
      </CatalogFormDialog>

      <CatalogFormDialog
        title={editingDept ? `Edit "${editingDept.name}"` : ''}
        open={!!editingDept}
        onClose={() => setEditingDept(null)}
      >
        {editingDept && (
          <EditDepartmentForm
            department={editingDept}
            onDone={async () => {
              setEditingDept(null)
              await router.invalidate()
            }}
          />
        )}
      </CatalogFormDialog>

      <SyncSheetDialog
        open={showSyncDialog}
        onClose={() => setShowSyncDialog(false)}
        type="departments"
        onComplete={() => router.invalidate()}
      />
    </>
  )
}
