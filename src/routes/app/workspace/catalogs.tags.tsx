import { createFileRoute } from '@tanstack/react-router'
import { TagsTablePage } from '#/components/time-tracker/catalogs/TagsTablePage'
import { getPaginatedTagsFn } from '#/lib/server/tracker'
import { getWorkspaceAccessFn } from '#/lib/server/workspace-access'

const PAGE_SIZE = 20

type TagsSearch = {
  page?: number
  search?: string
  showArchived?: boolean
}

export const Route = createFileRoute('/app/workspace/catalogs/tags')({
  validateSearch: (search: Record<string, unknown>): TagsSearch => ({
    page: typeof search.page === 'number' ? search.page : undefined,
    search: typeof search.search === 'string' ? search.search : undefined,
    showArchived:
      typeof search.showArchived === 'boolean'
        ? search.showArchived
        : undefined,
  }),
  loaderDeps: ({ search }) => ({
    page: search.page ?? 0,
    search: search.search ?? '',
    showArchived: search.showArchived ?? false,
  }),
  loader: async ({ deps }) => {
    const [access, paginatedTags] = await Promise.all([
      getWorkspaceAccessFn(),
      getPaginatedTagsFn({
        data: {
          page: deps.page,
          pageSize: PAGE_SIZE,
          search: deps.search || undefined,
          includeArchived: deps.showArchived || undefined,
        },
      }),
    ])
    return { access, data: paginatedTags, pageSize: PAGE_SIZE }
  },
  staleTime: 30_000,
  component: TagsRoute,
})

function TagsRoute() {
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

  const googleSheetUrl = access.workspace.googleSheetUrl

  return (
    <TagsTablePage
      data={data}
      page={search.page ?? 0}
      pageSize={pageSize}
      search={search.search ?? ''}
      showArchived={search.showArchived ?? false}
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
