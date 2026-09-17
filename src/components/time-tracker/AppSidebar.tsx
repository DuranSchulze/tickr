import { memo } from 'react'
import type { ComponentType } from 'react'
import { Link } from '@tanstack/react-router'
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  Cog,
  PanelLeftClose,
  PanelLeftOpen,
  Timer,
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
  analyticsGroupActive,
  analyticsOpen,
  onToggleAnalytics,
  analyticsChildren,
  calendarActive,
  settingsActive,
  settingsOpen,
  onToggleSettings,
  settingsChildren,
}: {
  collapsed: boolean
  onToggleCollapsed: () => void
  workspaceName: string
  userEmail: string
  timerActive: boolean
  analyticsGroupActive: boolean
  analyticsOpen: boolean
  onToggleAnalytics: () => void
  analyticsChildren: readonly NavItem[]
  calendarActive: boolean
  settingsActive: boolean
  settingsOpen: boolean
  onToggleSettings: () => void
  settingsChildren: readonly NavItem[]
}) {
  const hasAnalyticsChildren = analyticsChildren.length > 0
  const firstAnalyticsChild = analyticsChildren[0]
  const hasSettingsChildren = settingsChildren.length > 0
  const firstSettingsChild = settingsChildren[0]

  const navLinkClass = (active: boolean) =>
    `flex h-10 w-full items-center gap-3 rounded-full text-sm font-medium transition-colors ${
      collapsed ? 'justify-center px-0' : 'px-3'
    } ${
      active
        ? 'bg-stone text-foreground [&_svg]:text-primary'
        : 'text-smoke hover:bg-stone/60 hover:text-foreground'
    }`

  const groupButtonClass = (active: boolean, open: boolean) =>
    `mt-2 flex h-10 w-full items-center gap-3 rounded-full px-3 text-sm font-medium transition-colors ${
      active && !open
        ? 'bg-stone text-foreground [&_svg]:text-primary'
        : active
          ? 'bg-stone/60 text-foreground [&_svg]:text-primary'
          : 'text-smoke hover:bg-stone/60 hover:text-foreground'
    }`

  return (
    <aside
      className={`hidden h-full shrink-0 flex-col bg-sidebar transition-[width] duration-200 ease-in-out lg:flex ${
        collapsed ? 'w-[64px]' : 'w-[264px]'
      }`}
    >
      <div className="flex flex-1 flex-col overflow-y-auto px-2.5 py-3">
        {collapsed ? (
          <div className="mb-3 flex flex-col items-center gap-2.5">
            <button
              type="button"
              onClick={onToggleCollapsed}
              title="Expand sidebar"
              className="flex size-9 items-center justify-center rounded-full text-smoke transition-colors hover:bg-stone/60 hover:text-foreground"
            >
              <PanelLeftOpen className="size-4" />
            </button>
            <div className="flex size-9 items-center justify-center rounded-full bg-stone">
              <BriefcaseBusiness className="size-4 text-primary" />
            </div>
          </div>
        ) : (
          <div className="mb-3 rounded-xl border border-stone bg-eggshell p-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-stone shadow-[var(--shadow-whisper)]">
                <BriefcaseBusiness className="size-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-graphite">
                  Workspace
                </p>
                <p className="m-0 mt-0.5 truncate text-sm font-bold text-foreground">
                  {workspaceName}
                </p>
              </div>
              <button
                type="button"
                onClick={onToggleCollapsed}
                title="Collapse sidebar"
                className="flex size-7 shrink-0 items-center justify-center rounded-full text-smoke transition-colors hover:bg-stone/60 hover:text-foreground"
              >
                <PanelLeftClose className="size-4" />
              </button>
            </div>
            <p className="m-0 mt-2.5 truncate border-t border-stone pt-2 text-xs text-smoke">
              {userEmail}
            </p>
          </div>
        )}

        <nav className="grid gap-0.5">
          <Link
            to="/app/time-tracker"
            title="Timer"
            className={navLinkClass(timerActive)}
          >
            <Timer className="size-4 shrink-0" />
            {!collapsed && <span>Timer</span>}
          </Link>

          <Link
            to="/app/calendar"
            title="Calendar"
            className={navLinkClass(calendarActive)}
          >
            <CalendarDays className="size-4 shrink-0" />
            {!collapsed && <span>Calendar</span>}
          </Link>

          {hasAnalyticsChildren && (
            <>
              {collapsed ? (
                <Link
                  to={firstAnalyticsChild.to}
                  title="Analytics"
                  className={`mt-2 ${navLinkClass(analyticsGroupActive)}`}
                >
                  <BarChart3 className="size-4 shrink-0" />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={onToggleAnalytics}
                  className={groupButtonClass(
                    analyticsGroupActive,
                    analyticsOpen,
                  )}
                >
                  <BarChart3 className="size-4 shrink-0" />
                  <span className="flex-1 text-left">Analytics</span>
                  <ChevronDown
                    className={`size-3.5 shrink-0 transition-transform duration-200 ${
                      analyticsOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              )}

              {!collapsed && analyticsOpen && (
                <div className="ml-4 mt-0.5 grid gap-0.5 border-l border-stone pl-3">
                  {analyticsChildren.map((item) => {
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.to}
                        to={item.to as '/app/analytics'}
                        className="flex items-center gap-2.5 rounded-full px-3 py-2 text-sm font-medium text-smoke no-underline transition-colors hover:bg-stone/60 hover:text-foreground"
                        activeProps={{
                          className:
                            'flex items-center gap-2.5 rounded-full bg-stone px-3 py-2 text-sm font-semibold text-foreground no-underline transition-colors [&_svg]:text-primary',
                        }}
                      >
                        <Icon className="size-4 shrink-0" />
                        {item.label}
                      </Link>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {hasSettingsChildren && (
            <>
              {collapsed ? (
                <Link
                  to={firstSettingsChild.to}
                  title="Settings"
                  className={`mt-2 ${navLinkClass(settingsActive)}`}
                >
                  <Cog className="size-4 shrink-0" />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={onToggleSettings}
                  className={groupButtonClass(settingsActive, settingsOpen)}
                >
                  <Cog className="size-4 shrink-0" />
                  <span className="flex-1 text-left">Settings</span>
                  <ChevronDown
                    className={`size-3.5 shrink-0 transition-transform duration-200 ${
                      settingsOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              )}

              {!collapsed && settingsOpen && (
                <div className="ml-4 mt-0.5 grid gap-0.5 border-l border-stone pl-3">
                  {settingsChildren.map((item) => {
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.to}
                        to={item.to as '/app/workspace/members'}
                        className="flex items-center gap-2.5 rounded-full px-3 py-2 text-sm font-medium text-smoke no-underline transition-colors hover:bg-stone/60 hover:text-foreground"
                        activeProps={{
                          className:
                            'flex items-center gap-2.5 rounded-full bg-stone px-3 py-2 text-sm font-semibold text-foreground no-underline transition-colors [&_svg]:text-primary',
                        }}
                      >
                        <Icon className="size-4 shrink-0" />
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
