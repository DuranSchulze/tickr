import { memo } from 'react'
import type { ComponentType } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Activity,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  Cog,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Timer,
  TrendingUp,
} from 'lucide-react'

type NavItem = {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  exact?: boolean
}

export const AppSidebar = memo(function ({
  collapsed,
  onToggleCollapsed,
  workspaceName,
  userEmail,
  timerActive,
  analyticsActive,
  performanceActive,
  calendarActive,
  workspacesActive,
  activityActive,
  settingsActive,
  settingsOpen,
  onToggleSettings,
  settingsChildren,
  permissionLevel,
}: {
  collapsed: boolean
  onToggleCollapsed: () => void
  workspaceName: string
  userEmail: string
  timerActive: boolean
  analyticsActive: boolean
  performanceActive: boolean
  calendarActive: boolean
  workspacesActive: boolean
  activityActive: boolean
  settingsActive: boolean
  settingsOpen: boolean
  onToggleSettings: () => void
  settingsChildren: readonly NavItem[]
  permissionLevel: string
}) {
  const canAccessAnalytics = permissionLevel !== 'EMPLOYEE'
  const isOwnerOrAdmin =
    permissionLevel === 'OWNER' || permissionLevel === 'ADMIN'
  const hasSettingsChildren = settingsChildren.length > 0
  const firstSettingsChild = settingsChildren[0]

  return (
    <aside
      className={`hidden h-full shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 ease-in-out lg:flex ${
        collapsed ? 'w-[60px]' : 'w-[260px]'
      }`}
    >
      <div className="flex flex-1 flex-col overflow-y-auto px-2 py-3">
        {collapsed ? (
          <div className="mb-3 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={onToggleCollapsed}
              title="Expand sidebar"
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
            <div className="flex h-9 w-9 items-center justify-center border border-primary/30 bg-primary/10">
              <BriefcaseBusiness className="h-4 w-4 text-primary" />
            </div>
          </div>
        ) : (
          <div className="mb-3 border border-primary/30 bg-primary/10 px-3 py-2.5">
            <div className="flex items-center justify-between">
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-primary">
                Workspace
              </p>
              <button
                type="button"
                onClick={onToggleCollapsed}
                title="Collapse sidebar"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
            <p className="m-0 mt-0.5 truncate text-sm font-bold text-foreground">
              {workspaceName}
            </p>
            <p className="m-0 mt-0.5 truncate text-xs text-muted-foreground">
              {userEmail}
            </p>
          </div>
        )}

        <nav className="grid gap-0.5">
          <Link
            to="/app/time-tracker"
            title="Timer"
            className={`flex h-10 w-full items-center ${
              collapsed ? 'justify-center' : 'gap-3 px-3'
            } text-sm font-semibold transition-colors ${
              timerActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            <Timer className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Timer</span>}
          </Link>

          {canAccessAnalytics && (
            <Link
              to="/app/analytics"
              title="Analytics"
              className={`flex h-10 w-full items-center ${
                collapsed ? 'justify-center' : 'gap-3 px-3'
              } text-sm font-semibold transition-colors ${
                analyticsActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <BarChart3 className="h-4 w-4 shrink-0" />
              {!collapsed && <span>Analytics</span>}
            </Link>
          )}

          <Link
            to="/app/calendar"
            title="Calendar"
            className={`flex h-10 w-full items-center ${
              collapsed ? 'justify-center' : 'gap-3 px-3'
            } text-sm font-semibold transition-colors ${
              calendarActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            <CalendarDays className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Calendar</span>}
          </Link>

          <Link
            to="/app/my-performance"
            title="My Performance"
            className={`flex h-10 w-full items-center ${
              collapsed ? 'justify-center' : 'gap-3 px-3'
            } text-sm font-semibold transition-colors ${
              performanceActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            <TrendingUp className="h-4 w-4 shrink-0" />
            {!collapsed && <span>My Performance</span>}
          </Link>

          <Link
            to="/app/my-workspaces"
            title="My Workspaces"
            className={`flex h-10 w-full items-center ${
              collapsed ? 'justify-center' : 'gap-3 px-3'
            } text-sm font-semibold transition-colors ${
              workspacesActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            <LayoutGrid className="h-4 w-4 shrink-0" />
            {!collapsed && <span>My Workspaces</span>}
          </Link>

          {isOwnerOrAdmin && (
            <Link
              to="/app/workspace/activity"
              title="Team Activity"
              className={`flex h-10 w-full items-center ${
                collapsed ? 'justify-center' : 'gap-3 px-3'
              } text-sm font-semibold transition-colors ${
                activityActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <Activity className="h-4 w-4 shrink-0" />
              {!collapsed && <span>Team Activity</span>}
            </Link>
          )}

          {hasSettingsChildren && (
            <>
              {collapsed ? (
                <Link
                  to={firstSettingsChild.to}
                  title="Settings"
                  className={`mt-1 flex h-10 w-full items-center justify-center transition-colors ${
                    settingsActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <Cog className="h-4 w-4" />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={onToggleSettings}
                  className={`mt-1 flex w-full items-center gap-3 px-3 py-2 text-sm font-semibold transition-colors ${
                    settingsActive && !settingsOpen
                      ? 'bg-primary text-primary-foreground'
                      : settingsActive
                        ? 'bg-primary/15 text-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <Cog className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">Settings</span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
                      settingsOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              )}

              {!collapsed && settingsOpen && (
                <div className="ml-3 mt-0.5 grid gap-0.5 border-l border-border pl-3">
                  {settingsChildren.map((item) => {
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.to}
                        to={item.to as '/app/workspace/members'}
                        className="flex items-center gap-3 px-3 py-2 text-sm font-semibold text-muted-foreground no-underline hover:bg-accent hover:text-foreground"
                        activeProps={{
                          className:
                            'flex items-center gap-3 bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground no-underline',
                        }}
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </nav>
      </div>
    </aside>
  )
})
