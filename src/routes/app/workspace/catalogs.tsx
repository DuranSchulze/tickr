import {
  createFileRoute,
  Outlet,
  redirect,
  useRouterState,
} from '@tanstack/react-router'
import { CatalogsScreen } from '#/components/time-tracker/catalogs/CatalogsScreen'
import { getCatalogBootstrapStateFn } from '#/lib/server/tracker'
import {
  ensureWorkspaceAuthorization,
  fetchFreshWorkspaceAuthorization,
} from '#/lib/time-tracker/workspace-authorization'

export const Route = createFileRoute('/app/workspace/catalogs')({
  beforeLoad: async ({ context }) => {
    const access = await fetchFreshWorkspaceAuthorization(context.queryClient)
    if (!access.member.permissions['catalogs.view']) {
      throw redirect({ to: '/app/time-tracker' })
    }
  },
  loader: async ({ context }) => {
    const [state, access] = await Promise.all([
      getCatalogBootstrapStateFn(),
      ensureWorkspaceAuthorization(context.queryClient),
    ])
    return {
      state,
      canManage: access.member.permissions['catalogs.manage'],
      canImport: access.member.permissions['catalogs.import'],
      canManageRoles: access.member.permissions['roles.manage_permissions'],
      actorPermissionLevel: access.member.permissionLevel,
    }
  },
  staleTime: 30_000,
  component: CatalogsRoute,
})

// oxlint-disable-next-line react/only-export-components
function CatalogsRoute() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const data = Route.useLoaderData()

  const isSubPage =
    pathname !== '/app/workspace/catalogs' &&
    pathname !== '/app/workspace/catalogs/'

  if (isSubPage) return <Outlet />

  return <CatalogsScreen {...data} />
}
