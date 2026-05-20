import { createFileRoute } from '@tanstack/react-router'
import { ProjectsTablePage } from '#/components/time-tracker/catalogs/ProjectsTablePage'
import { getPaginatedProjectsFn } from '#/lib/server/tracker'
import { getWorkspaceAccessFn } from '#/lib/server/workspace-access'

const PAGE_SIZE = 20

type ProjectsSearch = {
  page?: number
  search?: string
  clientId?: string
  showArchived?: boolean
}

export const Route = createFileRoute('/app/workspace/catalogs/projects')({
  validateSearch: (search: Record<string, unknown>): ProjectsSearch => ({
    page: typeof search.page === 'number' ? search.page : undefined,
    search: typeof search.search === 'string' ? search.search : undefined,
    clientId: typeof search.clientId === 'string' ? search.clientId : undefined,
    showArchived:
      typeof search.showArchived === 'boolean'
        ? search.showArchived
        : undefined,
  }),
  loaderDeps: ({ search }) => ({
    page: search.page ?? 0,
    search: search.search ?? '',
    clientId: search.clientId ?? '',
    showArchived: search.showArchived ?? false,
  }),
  loader: async ({ deps }) => {
    const [access, paginatedProjects] = await Promise.all([
      getWorkspaceAccessFn(),
      getPaginatedProjectsFn({
        data: {
          page: deps.page,
          pageSize: PAGE_SIZE,
          search: deps.search || undefined,
          clientId: deps.clientId || undefined,
          includeArchived: deps.showArchived || undefined,
        },
      }),
    ])
    return { access, data: paginatedProjects, pageSize: PAGE_SIZE }
  },
  staleTime: 30_000,
  component: ProjectsRoute,
})

function ProjectsRoute() {
  const { access, data, pageSize } = Route.useLoaderData()
  const navigate = Route.useNavigate()
  const search = Route.useSearch()

  const canManage =
    access.member.permissionLevel === 'OWNER' ||
    access.member.permissionLevel === 'ADMIN'

  const canImportSheet =
    access.member.permissionLevel === 'OWNER' ||
    access.member.permissionLevel === 'ADMIN' ||
    access.member.permissionLevel === 'MANAGER'

  const canViewBillable = canImportSheet

  const currency = access.workspace.billableCurrency

  const googleSheetUrl = access.workspace.googleSheetUrl

  return (
    <ProjectsTablePage
      data={data}
      page={search.page ?? 0}
      pageSize={pageSize}
      search={search.search ?? ''}
      clientFilter={search.clientId ?? ''}
      showArchived={search.showArchived ?? false}
      canManage={canManage}
      canImportSheet={canImportSheet}
      canViewBillable={canViewBillable}
      currency={currency}
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
