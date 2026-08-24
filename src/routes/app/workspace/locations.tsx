import { createFileRoute, redirect } from '@tanstack/react-router'
import { LocationHistoryScreen } from '#/components/time-tracker/screens/LocationHistoryScreen/LocationHistoryScreen'
import { getWorkspaceAccessFn } from '#/lib/server/workspace-access'
import {
  fetchLocationHistory,
  getLocationHistoryQueryKey,
} from '#/lib/time-tracker/location-history-query'

type LocationHistorySearch = {
  memberId?: string
}

export const Route = createFileRoute('/app/workspace/locations')({
  validateSearch: (
    search: Record<string, unknown>,
  ): LocationHistorySearch => ({
    memberId:
      typeof search.memberId === 'string' && search.memberId.trim()
        ? search.memberId.trim()
        : undefined,
  }),
  loaderDeps: ({ search }) => ({ memberId: search.memberId }),
  beforeLoad: async ({ context }) => {
    const access = await context.queryClient.ensureQueryData({
      queryKey: ['workspace-access'],
      queryFn: () => getWorkspaceAccessFn(),
      staleTime: 5 * 60 * 1000,
    })
    const level = access.member.permissionLevel
    if (level !== 'OWNER' && level !== 'ADMIN' && level !== 'MANAGER') {
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
