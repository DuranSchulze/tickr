import { createFileRoute } from '@tanstack/react-router'
import { RolesTablePage } from '#/components/time-tracker/catalogs/RolesTablePage'
import { getPaginatedRolesFn } from '#/lib/server/tracker'

const PAGE_SIZE = 20

type RolesSearch = {
  page?: number
  search?: string
}

export const Route = createFileRoute('/app/workspace/catalogs/roles')({
  validateSearch: (search: Record<string, unknown>): RolesSearch => ({
    page: typeof search.page === 'number' ? search.page : undefined,
    search: typeof search.search === 'string' ? search.search : undefined,
  }),
  loaderDeps: ({ search }) => ({
    page: search.page ?? 0,
    search: search.search ?? '',
  }),
  loader: async ({ deps }) => {
    const paginatedRoles = await getPaginatedRolesFn({
      data: {
        page: deps.page,
        pageSize: PAGE_SIZE,
        search: deps.search || undefined,
      },
    })
    return { data: paginatedRoles, pageSize: PAGE_SIZE }
  },
  staleTime: 30_000,
  component: RolesRoute,
})

function RolesRoute() {
  const { data, pageSize } = Route.useLoaderData()
  const navigate = Route.useNavigate()
  const search = Route.useSearch()

  return (
    <RolesTablePage
      data={data}
      page={search.page ?? 0}
      pageSize={pageSize}
      search={search.search ?? ''}
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
