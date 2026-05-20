import { useMemo } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import type { PaginatedRole } from '#/lib/server/tracker/catalogs/paginated.server'
import { CatalogSearchBar, CatalogTablePage } from './CatalogTableLayout'

const col = createColumnHelper<PaginatedRole>()

const PERMISSION_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
}

interface Props {
  data: {
    items: PaginatedRole[]
    totalCount: number
    totalPages: number
  }
  page: number
  pageSize: number
  search: string
  onFilterChange: (updates: Record<string, string | undefined>) => void
  onPageChange: (page: number) => void
}

export function RolesTablePage({
  data,
  page,
  pageSize,
  search,
  onFilterChange,
  onPageChange,
}: Props) {
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
      col.accessor('permissionLevel', {
        header: 'Permission Level',
        cell: ({ getValue }) => {
          const level = getValue()
          return (
            <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground">
              {PERMISSION_LABELS[level] ?? level}
            </span>
          )
        },
      }),
    ],
    [],
  )

  const toolbar = (
    <div className="w-full max-w-xs">
      <CatalogSearchBar
        value={search}
        onChange={(v) => onFilterChange({ search: v || undefined })}
        placeholder="Search roles…"
      />
    </div>
  )

  return (
    <CatalogTablePage
      title="Roles"
      description="Permission levels used to control workspace access. Manage roles in Workspace Settings."
      data={data.items}
      columns={columns}
      totalCount={data.totalCount}
      totalPages={data.totalPages}
      page={page}
      pageSize={pageSize}
      onPageChange={onPageChange}
      canManage={false}
      toolbar={toolbar}
      emptyMessage={
        search ? 'No roles match your search.' : 'No roles configured.'
      }
    />
  )
}
