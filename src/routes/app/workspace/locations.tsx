import { createFileRoute, redirect } from '@tanstack/react-router'
import { LocationHistoryScreen } from '#/components/time-tracker/screens/LocationHistoryScreen/LocationHistoryScreen'
import { fetchFreshWorkspaceAuthorization } from '#/lib/time-tracker/workspace-authorization'
import {
  fetchLocationHistory,
  getLocationHistoryQueryKey,
} from '#/lib/time-tracker/location-history-query'

type LocationHistorySearch = {
  memberId?: string
}

export const Route = createFileRoute('/app/workspace/locations')({
  validateSearch: (search: Record<string, unknown>): LocationHistorySearch => ({
    memberId:
      typeof search.memberId === 'string' && search.memberId.trim()
        ? search.memberId.trim()
        : undefined,
  }),
  loaderDeps: ({ search }) => ({ memberId: search.memberId }),
  beforeLoad: async ({ context }) => {
    const access = await fetchFreshWorkspaceAuthorization(context.queryClient)
    if (!access.member.permissions['locations.view']) {
      throw redirect({ to: '/app/time-tracker' })
    }
  },
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData({
      queryKey: getLocationHistoryQueryKey(deps),
      queryFn: () => fetchLocationHistory(deps),
      staleTime: 30_000,
    }),
  component: LocationHistoryRoute,
})

function LocationHistoryRoute() {
  const initialData = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <LocationHistoryScreen
      initialData={initialData}
      currentFilters={search}
      onChangeMember={(memberId) => {
        void navigate({
          search: (previous) => ({
            ...previous,
            memberId: memberId || undefined,
          }),
        })
      }}
    />
  )
}
