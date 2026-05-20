import { useEffect, useMemo, useState } from 'react'
import { Outlet, useRouterState } from '@tanstack/react-router'
import { ClipboardList, Cog, ExternalLink, Tags, Users } from 'lucide-react'
import { AppSidebar } from './AppSidebar'
import { MobileNav } from './MobileNav'
import { Navbar } from './Navbar'
import { AnnouncementProvider } from '#/features/announcements/AnnouncementProvider'
import type { Workspace } from '#/lib/time-tracker/types'

type AppShellWorkspace = Pick<Workspace, 'id' | 'name' | 'timezone'>

function EmbedFooter() {
  return (
    <div className="sticky bottom-0 mt-2 flex items-center justify-center border-t border-border/50 bg-background/80 py-1.5 backdrop-blur-sm">
      <a
        href="/app/time-tracker"
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        Open in full app
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  )
}

export function AppShell({
  workspace,
  user,
  permissionLevel,
}: {
  workspace: AppShellWorkspace
  user: { id: string; name: string; email: string; image?: string | null }
  permissionLevel: string
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      fetch('/api/health', { keepalive: true }).catch(() => undefined)
    }
  }, [])

  // Two separate primitive selectors so TanStack Router uses Object.is correctly.
  // A single selector returning `{ pathname, search }` creates a new object on
  // every call, making AppShell (and all children) re-render on every router
  // state change even when values haven't changed.
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isEmbed = useRouterState({
    select: (s) =>
      'embed' in s.location.search &&
      (s.location.search as Record<string, unknown>).embed === '1',
  })

  const timerActive = pathname.startsWith('/app/time-tracker')
  const analyticsActive = pathname.startsWith('/app/analytics')
  const performanceActive = pathname.startsWith('/app/my-performance')
  const calendarActive = pathname.startsWith('/app/calendar')
  const activityActive = pathname.startsWith('/app/workspace/activity')
  const settingsActive =
    (pathname.startsWith('/app/workspace') &&
      !pathname.startsWith('/app/workspace/activity')) ||
    pathname.startsWith('/app/audit-logs')

  const [settingsOpen, setSettingsOpen] = useState(settingsActive)
  const [collapsed, setCollapsed] = useState(false)

  const isOwnerOrAdmin =
    permissionLevel === 'OWNER' || permissionLevel === 'ADMIN'
  const canAccessSettings = permissionLevel !== 'EMPLOYEE'

  const settingsChildren = useMemo(() => {
    const items = []
    if (canAccessSettings) {
      items.push({
        to: '/app/workspace/members' as const,
        label: 'Members',
        icon: Users,
      })
      items.push({
        to: '/app/workspace/catalogs' as const,
        label: 'Catalogs',
        icon: Tags,
      })
    }
    if (isOwnerOrAdmin) {
      items.push({
        to: '/app/workspace/settings' as const,
        label: 'Workspace settings',
        icon: Cog,
      })
      items.push({
        to: '/app/audit-logs' as const,
        label: 'Audit Logs',
        icon: ClipboardList,
      })
    }
    return items
  }, [canAccessSettings, isOwnerOrAdmin])

  return (
    <AnnouncementProvider>
      <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
        {!isEmbed && (
          <div className="print:hidden">
            <Navbar
              workspace={workspace}
              user={user}
              mobileMenuButton={
                <MobileNav
                  workspaceName={workspace.name}
                  userEmail={user.email}
                  timerActive={timerActive}
                  analyticsActive={analyticsActive}
                  performanceActive={performanceActive}
                  calendarActive={calendarActive}
                  activityActive={activityActive}
                  settingsActive={settingsActive}
                  settingsOpen={settingsOpen}
                  onToggleSettings={() => setSettingsOpen((open) => !open)}
                  settingsChildren={settingsChildren}
                  permissionLevel={permissionLevel}
                />
              }
            />
          </div>
        )}

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {!isEmbed && (
            <div className="print:hidden">
              <AppSidebar
                collapsed={collapsed}
                onToggleCollapsed={() => setCollapsed((c) => !c)}
                workspaceName={workspace.name}
                userEmail={user.email}
                timerActive={timerActive}
                analyticsActive={analyticsActive}
                performanceActive={performanceActive}
                calendarActive={calendarActive}
                activityActive={activityActive}
                settingsActive={settingsActive}
                settingsOpen={settingsOpen}
                onToggleSettings={() => setSettingsOpen((open) => !open)}
                settingsChildren={settingsChildren}
                permissionLevel={permissionLevel}
              />
            </div>
          )}

          <main
            className={`min-w-0 flex-1 overflow-y-auto overflow-x-hidden ${isEmbed ? 'p-2' : 'p-4 sm:p-6'}`}
          >
            <Outlet />
            {isEmbed && <EmbedFooter />}
          </main>
        </div>
      </div>
    </AnnouncementProvider>
  )
}
