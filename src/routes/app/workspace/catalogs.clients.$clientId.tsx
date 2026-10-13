import { createFileRoute, redirect } from '@tanstack/react-router'
import { ClientDetailScreen } from '#/components/time-tracker/catalogs/ClientDetailScreen'
import { getClientDetailFn } from '#/lib/server/tracker'
import { getWorkspaceAccessFn } from '#/lib/server/workspace-access'
import { fetchFreshWorkspaceAuthorization } from '#/lib/time-tracker/workspace-authorization'

export const Route = createFileRoute(
  '/app/workspace/catalogs/clients/$clientId',
)({
  beforeLoad: async ({ context }) => {
    const access = await fetchFreshWorkspaceAuthorization(context.queryClient)
    if (!access.member.permissions['catalogs.view']) {
      throw redirect({ to: '/app/time-tracker' })
    }
  },
  loader: async ({ params }) => {
    const [access, detail] = await Promise.all([
      getWorkspaceAccessFn(),
      getClientDetailFn({ data: { clientId: params.clientId } }),
    ])
    return { access, detail }
  },
  staleTime: 30_000,
  component: ClientDetailRoute,
})

// oxlint-disable-next-line react/only-export-components
function ClientDetailRoute() {
  const { access, detail } = Route.useLoaderData()
  const canViewBillable = access.member.permissions['catalogs.view']
  const currency = access.workspace.billableCurrency

  return (
    <ClientDetailScreen
      detail={detail}
      canViewBillable={canViewBillable}
      currency={currency}
    />
  )
}
