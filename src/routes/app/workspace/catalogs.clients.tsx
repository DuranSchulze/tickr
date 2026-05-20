import { createFileRoute } from '@tanstack/react-router'
import { ClientsTablePage } from '#/components/time-tracker/catalogs/ClientsTablePage'
import { getPaginatedClientsFn } from '#/lib/server/tracker'
import { getWorkspaceAccessFn } from '#/lib/server/workspace-access'

const PAGE_SIZE = 20

type ClientsSearch = {
  page?: number
  search?: string
  status?: string
}

export const Route = createFileRoute('/app/workspace/catalogs/clients')({
  validateSearch: (search: Record<string, unknown>): ClientsSearch => ({
    page: typeof search.page === 'number' ? search.page : undefined,
    search: typeof search.search === 'string' ? search.search : undefined,
    status: typeof search.status === 'string' ? search.status : undefined,
  }),
  loaderDeps: ({ search }) => ({
    page: search.page ?? 0,
    search: search.search ?? '',
    status: search.status ?? '',
  }),
  loader: async ({ deps }) => {
    const [access, paginatedClients] = await Promise.all([
      getWorkspaceAccessFn(),
      getPaginatedClientsFn({
        data: {
          page: deps.page,
          pageSize: PAGE_SIZE,
          search: deps.search || undefined,
          status: deps.status || undefined,
        },
      }),
    ])
    return { access, data: paginatedClients, pageSize: PAGE_SIZE }
  },
  staleTime: 30_000,
  component: ClientsRoute,
})

function ClientsRoute() {
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
    <ClientsTablePage
      data={data}
      page={search.page ?? 0}
      pageSize={pageSize}
      search={search.search ?? ''}
      statusFilter={search.status ?? ''}
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
