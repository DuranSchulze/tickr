import { createFileRoute, redirect } from '@tanstack/react-router'
import { SettingsScreen } from '#/components/time-tracker/WorkspaceScreens'
import { getWorkspaceSettingsStateFn } from '#/lib/server/tracker'
import {
  ensureWorkspaceAuthorization,
  fetchFreshWorkspaceAuthorization,
} from '#/lib/time-tracker/workspace-authorization'

export const Route = createFileRoute('/app/workspace/settings')({
  beforeLoad: async ({ context }) => {
    const access = await fetchFreshWorkspaceAuthorization(context.queryClient)
    if (!access.member.permissions['workspace.settings.view']) {
      throw redirect({ to: '/app/time-tracker' })
    }
  },
  loader: async ({ context }) => {
    const [state, access] = await Promise.all([
      getWorkspaceSettingsStateFn(),
      ensureWorkspaceAuthorization(context.queryClient),
    ])
    return {
      state,
      canManageSettings: access.member.permissions['workspace.settings.manage'],
      canImportCatalogs: access.member.permissions['catalogs.import'],
    }
  },
  staleTime: 30_000,
  component: SettingsRoute,
})

// oxlint-disable-next-line react/only-export-components
function SettingsRoute() {
  const { state, canManageSettings, canImportCatalogs } = Route.useLoaderData()
  return (
    <SettingsScreen
      state={state}
      canManageSettings={canManageSettings}
      canImportCatalogs={canImportCatalogs}
    />
  )
}
