import { createFileRoute, redirect } from '@tanstack/react-router'
import { RolesTablePage } from '#/components/time-tracker/catalogs/RolesTablePage'
import { getPaginatedRolesFn } from '#/lib/server/tracker'
import {
  ensureWorkspaceAuthorization,
  fetchFreshWorkspaceAuthorization,
} from '#/lib/time-tracker/workspace-authorization'

const PAGE_SIZE = 20

type PermissionLevel = 'OWNER' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE'
type RoleSort = 'permission' | 'name_asc' | 'name_desc'

type RolesSearch = {
  page?: number
  search?: string
  permissionLevel?: PermissionLevel
  sort?: RoleSort
}

const LEVELS: PermissionLevel[] = ['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE']
const ROLE_SORTS: RoleSort[] = ['permission', 'name_asc', 'name_desc']

export const Route = createFileRoute('/app/workspace/catalogs/roles')({
  validateSearch: (search: Record<string, unknown>): RolesSearch => ({
    page: typeof search.page === 'number' ? search.page : undefined,
    search: typeof search.search === 'string' ? search.search : undefined,
    permissionLevel: LEVELS.includes(search.permissionLevel as PermissionLevel)
      ? (search.permissionLevel as PermissionLevel)
      : undefined,
    sort: ROLE_SORTS.includes(search.sort as RoleSort)
      ? (search.sort as RoleSort)
      : undefined,
  }),
  loaderDeps: ({ search }) => ({
    page: search.page ?? 0,
    search: search.search ?? '',
    permissionLevel: search.permissionLevel,
    sort: search.sort,
  }),
  beforeLoad: async ({ context }) => {
    const access = await fetchFreshWorkspaceAuthorization(context.queryClient)
    if (!access.member.permissions['catalogs.view']) {
      throw redirect({ to: '/app/time-tracker' })
    }
  },
  loader: async ({ context, deps }) => {
    const [paginatedRoles, access] = await Promise.all([
      getPaginatedRolesFn({
        data: {
          page: deps.page,
          pageSize: PAGE_SIZE,
          search: deps.search || undefined,
          permissionLevel: deps.permissionLevel,
          sort: deps.sort,
        },
      }),
      ensureWorkspaceAuthorization(context.queryClient),
    ])
    return {
      data: paginatedRoles,
      pageSize: PAGE_SIZE,
      canManagePermissions:
        access.member.permissions['roles.manage_permissions'],
      actor: {
        roleId: access.member.roleId,
        permissionLevel: access.member.permissionLevel,
        permissions: access.member.permissions,
      },
    }
  },
  staleTime: 30_000,
  component: RolesRoute,
})

// oxlint-disable-next-line react/only-export-components
function RolesRoute() {
  const { data, pageSize, canManagePermissions, actor } = Route.useLoaderData()
  const navigate = Route.useNavigate()
  const search = Route.useSearch()

  return (
    <RolesTablePage
      data={data}
      canManagePermissions={canManagePermissions}
      actor={actor}
      page={search.page ?? 0}
      pageSize={pageSize}
      appliedFilters={{
        search: search.search ?? '',
        permissionLevel: search.permissionLevel ?? '',
        sort: search.sort ?? 'permission',
      }}
      onFilterChange={(updates) => {
        void navigate({
          search: (prev) => ({ ...prev, ...updates, page: 0 }),
        })
      }}
      onPageChange={(page) => {
        void navigate({ search: (prev) => ({ ...prev, page }) })
      }}
    />
  )
}
