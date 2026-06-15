import { useMemo, useReducer } from 'react'
import { useRouter } from '@tanstack/react-router'
import { createColumnHelper } from '@tanstack/react-table'
import { gooeyToast } from '#/lib/toast'
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
  activateProjectFn,
  archiveProjectFn,
  bulkActivateProjectsFn,
  bulkArchiveProjectsFn,
} from '#/lib/server/tracker'
import {
  ensureCatalogTabsFn,
  syncCatalogsWithSheetFn,
} from '#/lib/server/gsheets/sync'
import type {
  PaginatedProject,
  PaginatedProjectsResult,
} from '#/lib/server/tracker/catalogs/paginated.server'
import { formatCurrency } from '#/lib/time-tracker/billing'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  CatalogFilterBar,
  CatalogFormDialog,
  CatalogTablePage,
} from './CatalogTableLayout'
import { ProjectForm } from './ProjectForm'
import { EditProjectForm } from './EditProjectForm'
import { SyncSheetDialog } from './SyncSheetDialog'

function formatSeconds(seconds: number): string {
  if (seconds === 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

const col = createColumnHelper<PaginatedProject>()

interface Props {
  data: PaginatedProjectsResult
  page: number
  pageSize: number
  appliedFilters: {
    search: string
    clientId: string
    showArchived: string
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

export function ProjectsTablePage({
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
  const [local, dispatch] = useReducer(
    (
      s: {
        showCreate: boolean
        editingProject: PaginatedProject | null
        archivingId: string | null
        sheetLoading: boolean
        showSyncDialog: boolean
      },
      a: Partial<typeof s>,
    ) => ({ ...s, ...a }),
    {
      showCreate: false,
      editingProject: null,
      archivingId: null,
      sheetLoading: false,
      showSyncDialog: false,
    },
  )
  const {
    showCreate,
    editingProject,
    archivingId,
    sheetLoading,
    showSyncDialog,
  } = local

  async function handleArchive(project: PaginatedProject) {
    dispatch({ archivingId: project.id })
    try {
      await archiveProjectFn({ data: { id: project.id } })
      await router.invalidate()
      gooeyToast.success(`"${project.name}" archived`)
    } catch (err) {
      gooeyToast.error('Failed to archive', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      dispatch({ archivingId: null })
    }
  }

  async function handleActivate(project: PaginatedProject) {
    dispatch({ archivingId: project.id })
    try {
      await activateProjectFn({ data: { id: project.id } })
      await router.invalidate()
      gooeyToast.success(`"${project.name}" activated`)
    } catch (err) {
      gooeyToast.error('Failed to activate', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      dispatch({ archivingId: null })
    }
  }

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

  function handleImportFromSheet() {
    dispatch({ showSyncDialog: true })
  }

  const columns = useMemo(
    () => [
      col.accessor('name', {
        header: 'Name',
        cell: ({ getValue, row }) => (
          <div className="flex items-center gap-2">
            <span
              className="size-3 shrink-0 rounded-full border border-white/20"
              style={{ backgroundColor: row.original.color }}
            />
            <span className="font-semibold text-foreground">{getValue()}</span>
          </div>
        ),
      }),
      col.accessor('clientName', {
        header: 'Client',
        cell: ({ getValue }) => (
          <span className="text-sm text-muted-foreground">{getValue()}</span>
        ),
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
                const project = row.original
                return (
                  <div className="flex justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        disabled={archivingId === project.id}
                        className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                        aria-label="Row actions"
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => dispatch({ editingProject: project })}
                        >
                          <Pencil className="mr-2 size-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {project.archived ? (
                          <DropdownMenuItem
                            onClick={() => handleActivate(project)}
                          >
                            <CheckCircle className="mr-2 size-4" />
                            Activate
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => handleArchive(project)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Archive className="mr-2 size-4" />
                            Archive
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
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <FileSpreadsheet className="size-4" aria-hidden />
        )}
        Sheet
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleImportFromSheet}>
          <RefreshCw className="mr-2 size-4" />
          Sync from Sheet
        </DropdownMenuItem>
        {canManage && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSync}>
              <RefreshCw className="mr-2 size-4" />
              Sync all catalogs
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSetupSheetTab}>
              <TableIcon className="mr-2 size-4" />
              Setup Sheet Tab
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null

  const toolbar = (
    <CatalogFilterBar
      searchPlaceholder="Search projects…"
      appliedValues={appliedFilters}
      onApply={onFilterChange}
      filters={[
        {
          key: 'clientId',
          label: 'Client',
          options: [
            { value: '', label: 'All clients' },
            ...data.clients.map((c) => ({ value: c.id, label: c.name })),
          ],
        },
        {
          key: 'showArchived',
          label: 'Archived',
          options: [
            { value: '', label: 'Active only' },
            { value: 'yes', label: 'Include archived' },
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

  const clientsForForm = data.clients.map((c) => ({
    ...c,
    clientStatus: 'ACTIVE' as const,
  }))

  const editingForForm = editingProject
    ? {
        id: editingProject.id,
        name: editingProject.name,
        color: editingProject.color,
        clientId: editingProject.clientId ?? '',
      }
    : null

  return (
    <>
      <CatalogTablePage
        title="Projects"
        description="Billable or internal work streams used by time entries."
        data={data.items}
        columns={columns}
        totalCount={data.totalCount}
        totalPages={data.totalPages}
        page={page}
        pageSize={pageSize}
        onPageChange={onPageChange}
        canManage={canManage}
        onCreate={() => dispatch({ showCreate: true })}
        createLabel="New Project"
        headerActions={sheetButton}
        toolbar={toolbar}
        emptyMessage={
          appliedFilters.search ||
          appliedFilters.clientId ||
          appliedFilters.showArchived
            ? 'No projects match your filters.'
            : 'No projects yet. Add your first project to get started.'
        }
        getRowId={(project) => project.id}
        onBulkAction={async (action, ids) => {
          if (action === 'activate') {
            await bulkActivateProjectsFn({ data: { ids } })
          } else {
            await bulkArchiveProjectsFn({ data: { ids } })
          }
          await router.invalidate()
          gooeyToast.success(
            `${ids.length} project${ids.length === 1 ? '' : 's'} ${action === 'activate' ? 'activated' : 'archived'}`,
          )
        }}
      />

      <CatalogFormDialog
        title="New Project"
        open={showCreate}
        onClose={() => dispatch({ showCreate: false })}
      >
        <ProjectForm
          clients={clientsForForm}
          onSuccess={async () => {
            dispatch({ showCreate: false })
            await router.invalidate()
          }}
        />
      </CatalogFormDialog>

      <CatalogFormDialog
        title={editingProject ? `Edit "${editingProject.name}"` : ''}
        open={!!editingProject}
        onClose={() => dispatch({ editingProject: null })}
      >
        {editingForForm && (
          <EditProjectForm
            project={editingForForm}
            clients={clientsForForm}
            onDone={async () => {
              dispatch({ editingProject: null })
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
        type="projects"
      />
    </>
  )
}
