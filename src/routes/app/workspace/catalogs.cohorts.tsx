import { createFileRoute } from '@tanstack/react-router'
import { CohortsTablePage } from '#/components/time-tracker/catalogs/CohortsTablePage'
import { getPaginatedCohortsFn } from '#/lib/server/tracker'
import { getWorkspaceAccessFn } from '#/lib/server/workspace-access'

const PAGE_SIZE = 20

type CohortsSearch = {
  page?: number
  search?: string
  departmentId?: string
}

export const Route = createFileRoute('/app/workspace/catalogs/cohorts')({
  validateSearch: (search: Record<string, unknown>): CohortsSearch => ({
    page: typeof search.page === 'number' ? search.page : undefined,
    search: typeof search.search === 'string' ? search.search : undefined,
    departmentId:
      typeof search.departmentId === 'string' ? search.departmentId : undefined,
  }),
  loaderDeps: ({ search }) => ({
    page: search.page ?? 0,
    search: search.search ?? '',
    departmentId: search.departmentId ?? '',
  }),
  loader: async ({ deps }) => {
    const [access, paginatedCohorts] = await Promise.all([
      getWorkspaceAccessFn(),
      getPaginatedCohortsFn({
        data: {
          page: deps.page,
          pageSize: PAGE_SIZE,
          search: deps.search || undefined,
          departmentId: deps.departmentId || undefined,
        },
      }),
    ])
    return { access, data: paginatedCohorts, pageSize: PAGE_SIZE }
  },
  staleTime: 30_000,
  component: CohortsRoute,
})

function CohortsRoute() {
  const { access, data, pageSize } = Route.useLoaderData()
  const navigate = Route.useNavigate()
  const search = Route.useSearch()

  const canManage =
    access.member.permissionLevel === 'OWNER' ||
    access.member.permissionLevel === 'ADMIN'

  return (
    <CohortsTablePage
      data={data}
      page={search.page ?? 0}
      pageSize={pageSize}
      search={search.search ?? ''}
      departmentFilter={search.departmentId ?? ''}
      canManage={canManage}
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
