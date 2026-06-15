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
  activateTagFn,
  archiveTagFn,
  bulkActivateTagsFn,
  bulkArchiveTagsFn,
} from '#/lib/server/tracker'
import {
  ensureCatalogTabsFn,
  syncCatalogsWithSheetFn,
} from '#/lib/server/gsheets/sync'
import type { PaginatedTag } from '#/lib/server/tracker/catalogs/paginated.server'
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
import { TagForm } from './TagForm'
import { EditTagForm } from './EditTagForm'
import { SyncSheetDialog } from './SyncSheetDialog'

function formatSeconds(seconds: number): string {
  if (seconds === 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

const col = createColumnHelper<PaginatedTag>()

interface Props {
  data: {
    items: PaginatedTag[]
    totalCount: number
    totalPages: number
  }
  page: number
  pageSize: number
  appliedFilters: {
    search: string
    showArchived: string
    sort: string
  }
  canManage: boolean
  canImportSheet: boolean
  googleSheetUrl: string | null
  onFilterChange: (updates: Record<string, string | undefined>) => void
  onPageChange: (page: number) => void
}

export function TagsTablePage({
  data,
  page,
  pageSize,
  appliedFilters,
  canManage,
  canImportSheet,
  googleSheetUrl,
  onFilterChange,
  onPageChange,
}: Props) {
  const router = useRouter()
  const [local, dispatch] = useReducer(
    (
      s: {
        showCreate: boolean
        editingTag: PaginatedTag | null
        archivingId: string | null
        sheetLoading: boolean
        showSyncDialog: boolean
      },
      a: Partial<typeof s>,
    ) => ({ ...s, ...a }),
    {
      showCreate: false,
      editingTag: null,
      archivingId: null,
      sheetLoading: false,
      showSyncDialog: false,
    },
  )
  const { showCreate, editingTag, archivingId, sheetLoading, showSyncDialog } =
    local

  async function handleArchive(tag: PaginatedTag) {
    dispatch({ archivingId: tag.id })
    try {
      await archiveTagFn({ data: { id: tag.id } })
      await router.invalidate()
      gooeyToast.success(`"${tag.name}" archived`)
    } catch (err) {
      gooeyToast.error('Failed to archive', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      dispatch({ archivingId: null })
    }
  }

  async function handleActivate(tag: PaginatedTag) {
    dispatch({ archivingId: tag.id })
    try {
      await activateTagFn({ data: { id: tag.id } })
      await router.invalidate()
      gooeyToast.success(`"${tag.name}" activated`)
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
      col.accessor('color', {
        header: 'Color',
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {getValue()}
          </span>
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
      col.accessor('entryCount', {
        header: 'Uses',
        cell: ({ getValue }) => {
          const count = getValue()
          return (
            <span className="text-sm tabular-nums text-muted-foreground">
              {count === 0
                ? '—'
                : `${count} ${count === 1 ? 'entry' : 'entries'}`}
            </span>
          )
        },
      }),
      ...(canManage
        ? [
            col.display({
              id: 'actions',
              header: '',
              cell: ({ row }) => {
                const tag = row.original
                return (
                  <div className="flex justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        disabled={archivingId === tag.id}
                        className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                        aria-label="Row actions"
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => dispatch({ editingTag: tag })}
                        >
                          <Pencil className="mr-2 size-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {tag.archived ? (
                          <DropdownMenuItem onClick={() => handleActivate(tag)}>
                            <CheckCircle className="mr-2 size-4" />
                            Activate
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => handleArchive(tag)}
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
    [canManage, archivingId],
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
      searchPlaceholder="Search tags…"
      appliedValues={appliedFilters}
      onApply={onFilterChange}
      filters={[
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

  return (
    <>
      <CatalogTablePage
        title="Tags"
        description="Labels for classifying tasks across projects and reports."
        data={data.items}
        columns={columns}
        totalCount={data.totalCount}
        totalPages={data.totalPages}
        page={page}
        pageSize={pageSize}
        onPageChange={onPageChange}
        canManage={canManage}
        onCreate={() => dispatch({ showCreate: true })}
        createLabel="New Tag"
        headerActions={sheetButton}
        toolbar={toolbar}
        emptyMessage={
          appliedFilters.search || appliedFilters.showArchived
            ? 'No tags match your filters.'
            : 'No tags yet. Add your first tag to get started.'
        }
        getRowId={(tag) => tag.id}
        onBulkAction={async (action, ids) => {
          if (action === 'activate') {
            await bulkActivateTagsFn({ data: { ids } })
          } else {
            await bulkArchiveTagsFn({ data: { ids } })
          }
          await router.invalidate()
          gooeyToast.success(
            `${ids.length} tag${ids.length === 1 ? '' : 's'} ${action === 'activate' ? 'activated' : 'archived'}`,
          )
        }}
      />

      <CatalogFormDialog
        title="New Tag"
        open={showCreate}
        onClose={() => dispatch({ showCreate: false })}
      >
        <TagForm
          onSuccess={async () => {
            dispatch({ showCreate: false })
            await router.invalidate()
          }}
        />
      </CatalogFormDialog>

      <CatalogFormDialog
        title={editingTag ? `Edit "${editingTag.name}"` : ''}
        open={!!editingTag}
        onClose={() => dispatch({ editingTag: null })}
      >
        {editingTag && (
          <EditTagForm
            tag={editingTag}
            onDone={async () => {
              dispatch({ editingTag: null })
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
        type="tags"
      />
    </>
  )
}
