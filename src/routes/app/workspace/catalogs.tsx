import {
  createFileRoute,
  Outlet,
  redirect,
  useRouterState,
} from '@tanstack/react-router'
import { CatalogsScreen } from '#/components/time-tracker/catalogs/CatalogsScreen'
import { getTrackerStateLiteFn } from '#/lib/server/tracker'
import { getWorkspaceAccessFn } from '#/lib/server/workspace-access'

export const Route = createFileRoute('/app/workspace/catalogs')({
  beforeLoad: async ({ context }) => {
    const access = await context.queryClient.ensureQueryData({
      queryKey: ['workspace-access'],
      queryFn: () => getWorkspaceAccessFn(),
      staleTime: 5 * 60 * 1000,
    })
    if (access.member.permissionLevel === 'EMPLOYEE') {
      throw redirect({ to: '/app/time-tracker' })
    }
  },
  loader: () => getTrackerStateLiteFn(),
  staleTime: 30_000,
  component: CatalogsRoute,
})

function CatalogsRoute() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const state = Route.useLoaderData()

  const isSubPage =
    pathname !== '/app/workspace/catalogs' &&
    pathname !== '/app/workspace/catalogs/'

  if (isSubPage) return <Outlet />

  return <CatalogsScreen state={state} />
}
