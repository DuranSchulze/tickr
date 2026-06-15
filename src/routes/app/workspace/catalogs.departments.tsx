import { createFileRoute } from '@tanstack/react-router'
import { DepartmentsTablePage } from '#/components/time-tracker/catalogs/DepartmentsTablePage'
import { getPaginatedDepartmentsFn } from '#/lib/server/tracker'
import { getWorkspaceAccessFn } from '#/lib/server/workspace-access'

const PAGE_SIZE = 20

type DescriptionFilter = 'yes' | 'no'
type MembersFilter = 'yes' | 'no'
type DepartmentSort = 'name_asc' | 'name_desc' | 'members_desc' | 'members_asc'

type DepartmentsSearch = {
  page?: number
  search?: string
  hasDescription?: DescriptionFilter
  hasMembers?: MembersFilter
  sort?: DepartmentSort
}

const SORTS: DepartmentSort[] = [
  'name_asc',
  'name_desc',
  'members_desc',
  'members_asc',
]

export const Route = createFileRoute('/app/workspace/catalogs/departments')({
  validateSearch: (search: Record<string, unknown>): DepartmentsSearch => ({
    page: typeof search.page === 'number' ? search.page : undefined,
    search: typeof search.search === 'string' ? search.search : undefined,
    hasDescription:
      search.hasDescription === 'yes' || search.hasDescription === 'no'
        ? search.hasDescription
        : undefined,
    hasMembers:
      search.hasMembers === 'yes' || search.hasMembers === 'no'
        ? search.hasMembers
        : undefined,
    sort: SORTS.includes(search.sort as DepartmentSort)
      ? (search.sort as DepartmentSort)
      : undefined,
  }),
  loaderDeps: ({ search }) => ({
    page: search.page ?? 0,
    search: search.search ?? '',
    hasDescription: search.hasDescription,
    hasMembers: search.hasMembers,
    sort: search.sort,
  }),
  loader: async ({ deps }) => {
    const [access, paginatedDepartments] = await Promise.all([
      getWorkspaceAccessFn(),
      getPaginatedDepartmentsFn({
        data: {
          page: deps.page,
          pageSize: PAGE_SIZE,
          search: deps.search || undefined,
          hasDescription: deps.hasDescription,
          hasMembers: deps.hasMembers,
          sort: deps.sort,
        },
      }),
    ])
    return {
      access,
      data: paginatedDepartments,
      pageSize: PAGE_SIZE,
      googleSheetUrl: access.workspace.googleSheetUrl ?? null,
    }
  },
  staleTime: 30_000,
  component: DepartmentsRoute,
})

// oxlint-disable-next-line react/only-export-components
function DepartmentsRoute() {
  const { access, data, pageSize, googleSheetUrl } = Route.useLoaderData()
  const navigate = Route.useNavigate()
  const search = Route.useSearch()

  const canManage =
    access.member.permissionLevel === 'OWNER' ||
    access.member.permissionLevel === 'ADMIN'

  const canImportSheet =
    access.member.permissionLevel === 'OWNER' ||
    access.member.permissionLevel === 'ADMIN' ||
    access.member.permissionLevel === 'MANAGER'

  return (
    <DepartmentsTablePage
      data={data}
      page={search.page ?? 0}
      pageSize={pageSize}
      appliedFilters={{
        search: search.search ?? '',
        hasDescription: search.hasDescription ?? '',
        hasMembers: search.hasMembers ?? '',
        sort: search.sort ?? 'name_asc',
      }}
      canManage={canManage}
      canImportSheet={canImportSheet}
      googleSheetUrl={googleSheetUrl}
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
