import { createFileRoute, redirect } from '@tanstack/react-router'
import {
  normalizeSettingsTab,
  SettingsScreen,
} from '#/components/time-tracker/WorkspaceScreens'
import type { SettingsTab } from '#/components/time-tracker/WorkspaceScreens'
import {
  getWorkspaceLocationDataSummaryFn,
  getWorkspaceSettingsStateFn,
} from '#/lib/server/tracker'
import {
  ensureWorkspaceAuthorization,
  fetchFreshWorkspaceAuthorization,
} from '#/lib/time-tracker/workspace-authorization'

type SettingsSearch = { tab?: SettingsTab }

export const Route = createFileRoute('/app/workspace/settings')({
  validateSearch: (search: Record<string, unknown>): SettingsSearch => {
    const tab = normalizeSettingsTab(search.tab)
    return tab === 'general' ? {} : { tab }
  },
  beforeLoad: async ({ context }) => {
    const access = await fetchFreshWorkspaceAuthorization(context.queryClient)
    if (!access.member.permissions['workspace.settings.view']) {
      throw redirect({ to: '/app/time-tracker' })
    }
  },
  loader: async ({ context }) => {
    const access = await ensureWorkspaceAuthorization(context.queryClient)
    const isOwner = access.member.permissionLevel === 'OWNER'
    const [state, locationDataSummary] = await Promise.all([
      getWorkspaceSettingsStateFn(),
      isOwner
        ? getWorkspaceLocationDataSummaryFn()
        : Promise.resolve({ taggedEntryCount: 0 }),
    ])
    return {
      state,
      isOwner,
      taggedEntryCount: locationDataSummary.taggedEntryCount,
      canManageSettings: access.member.permissions['workspace.settings.manage'],
      canImportCatalogs: access.member.permissions['catalogs.import'],
    }
  },
  staleTime: 30_000,
  component: SettingsRoute,
})

// oxlint-disable-next-line react/only-export-components
function SettingsRoute() {
  const {
    state,
    isOwner,
    taggedEntryCount,
    canManageSettings,
    canImportCatalogs,
  } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const activeTab =
    search.tab === 'developer' && !canManageSettings
      ? 'general'
      : (search.tab ?? 'general')

  return (
    <SettingsScreen
      state={state}
      isOwner={isOwner}
      taggedEntryCount={taggedEntryCount}
      canManageSettings={canManageSettings}
      canImportCatalogs={canImportCatalogs}
      activeTab={activeTab}
      onTabChange={(tab) => {
        void navigate({
          search: tab === 'general' ? {} : { tab },
          replace: true,
        })
      }}
    />
  )
}
