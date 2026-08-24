import { useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { useRouter } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import type { PaginatedRole } from '#/lib/server/tracker/catalogs/paginated.server'
import {
  getEffectivePermissions,
  PERMISSION_KEYS,
} from '#/lib/rbac/permissions'
import type { EffectivePermissions } from '#/lib/rbac/permissions'
import { CatalogFilterBar, CatalogTablePage } from './CatalogTableLayout'
import { RolePermissionsDialog } from './RolePermissionsDialog'
import { workspaceAuthorizationKeys } from '#/lib/time-tracker/workspace-authorization'
import { canManageRoleTarget } from '#/lib/rbac/authorization'

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
  appliedFilters: {
    search: string
    permissionLevel: string
    sort: string
  }
  onFilterChange: (updates: Record<string, string | undefined>) => void
  onPageChange: (page: number) => void
  canManagePermissions: boolean
  actor: {
    roleId: string | null
    permissionLevel: 'OWNER' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE'
    permissions: EffectivePermissions
  }
}

export function RolesTablePage({
  data,
  page,
  pageSize,
  appliedFilters,
  onFilterChange,
  onPageChange,
  canManagePermissions,
  actor,
}: Props) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [activeRole, setActiveRole] = useState<PaginatedRole | null>(null)
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
      col.display({
        id: 'access',
        header: 'Access',
        cell: ({ row }) => {
          const role = row.original
          const effective = getEffectivePermissions(
            role.permissionLevel,
            role.permissionOverrides,
          )
          const granted = PERMISSION_KEYS.filter((key) => effective[key]).length

          return (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {role.permissionLevel === 'OWNER'
                  ? 'Full access'
                  : `${granted} of ${PERMISSION_KEYS.length} permissions`}
              </span>
              {canManagePermissions && (
                <button
                  type="button"
                  onClick={() => setActiveRole(role)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  <ShieldCheck className="size-3.5" />
                  {canManageRoleTarget({
                    actorLevel: actor.permissionLevel,
                    actorRoleId: actor.roleId,
                    targetLevel: role.permissionLevel,
                    targetRoleId: role.id,
                  })
                    ? 'Configure'
                    : 'View'}
                </button>
              )}
            </div>
          )
        },
      }),
    ],
    [actor.permissionLevel, actor.roleId, canManagePermissions],
  )

  const toolbar = (
    <CatalogFilterBar
      searchPlaceholder="Search roles…"
      appliedValues={appliedFilters}
      onApply={onFilterChange}
      filters={[
        {
          key: 'permissionLevel',
          label: 'Permission level',
          options: [
            { value: '', label: 'All levels' },
            { value: 'OWNER', label: 'Owner' },
            { value: 'ADMIN', label: 'Admin' },
            { value: 'MANAGER', label: 'Manager' },
            { value: 'EMPLOYEE', label: 'Employee' },
          ],
        },
        {
          key: 'sort',
          label: 'Sort',
          defaultValue: 'permission',
          options: [
            { value: 'permission', label: 'By permission' },
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
        title="Roles"
        description="Configure what each workspace role can see and do. Hierarchy provides safe defaults; permission overrides provide flexibility."
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
          appliedFilters.search || appliedFilters.permissionLevel
            ? 'No roles match your filters.'
            : 'No roles configured.'
        }
      />
      {activeRole && (
        <RolePermissionsDialog
          key={activeRole.id}
          role={activeRole}
          actor={actor}
          open
          onOpenChange={(open) => {
            if (!open) setActiveRole(null)
          }}
          onSaved={async () => {
            setActiveRole(null)
            await queryClient.invalidateQueries({
              queryKey: workspaceAuthorizationKeys.all,
            })
            await router.invalidate()
          }}
        />
      )}
    </>
  )
}
