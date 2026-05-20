import { createFileRoute } from '@tanstack/react-router'
import { DepartmentsTablePage } from '#/components/time-tracker/catalogs/DepartmentsTablePage'
import { getPaginatedDepartmentsFn } from '#/lib/server/tracker'
import { getWorkspaceAccessFn } from '#/lib/server/workspace-access'

const PAGE_SIZE = 20

type DepartmentsSearch = {
  page?: number
  search?: string
}

export const Route = createFileRoute('/app/workspace/catalogs/departments')({
  validateSearch: (search: Record<string, unknown>): DepartmentsSearch => ({
    page: typeof search.page === 'number' ? search.page : undefined,
    search: typeof search.search === 'string' ? search.search : undefined,
  }),
  loaderDeps: ({ search }) => ({
    page: search.page ?? 0,
    search: search.search ?? '',
  }),
  loader: async ({ deps }) => {
    const [access, paginatedDepartments] = await Promise.all([
      getWorkspaceAccessFn(),
      getPaginatedDepartmentsFn({
        data: {
          page: deps.page,
          pageSize: PAGE_SIZE,
          search: deps.search || undefined,
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
      search={search.search ?? ''}
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
