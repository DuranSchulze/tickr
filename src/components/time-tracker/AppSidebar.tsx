import { memo, useState } from 'react'
import type { ComponentType } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  Cog,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  Palette,
  Settings,
  Sparkles,
  Timer,
  UserCircle,
} from 'lucide-react'
import { WorkspaceSwitcher } from '#/components/layout/WorkspaceSwitcher'
import { AppLogo } from '#/components/ui/AppLogo'
import { AppearanceDialog } from '#/components/settings/AppearanceDialog'
import { authClient } from '#/lib/auth-client'
import { Button } from '#/components/ui/button'

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
  workspaceId,
  permissionLevel,
  user,
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
  workspaceId: string
  permissionLevel: string
  user: { name: string; email: string; image?: string | null }
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
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const hasAnalyticsChildren = analyticsChildren.length > 0
  const firstAnalyticsChild = analyticsChildren[0]
  const hasSettingsChildren = settingsChildren.length > 0
  const firstSettingsChild = settingsChildren[0]

  const handleSignOut = () => {
    void authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          queryClient.clear()
          void navigate({ to: '/auth' })
        },
      },
    })
  }

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
            <WorkspaceSwitcher
              currentWorkspaceId={workspaceId}
              currentWorkspaceName={workspaceName}
              permissionLevel={permissionLevel}
              collapsed
            />
          </div>
        ) : (
          <div className="mb-3">
            <Link
              to="/app/time-tracker"
              className="mb-4 flex items-center px-2 no-underline"
            >
              <AppLogo size="md" />
            </Link>
            <div className="rounded-xl border border-stone bg-eggshell p-3">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-stone shadow-[var(--shadow-whisper)]">
                  <BriefcaseBusiness className="size-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-graphite">
                    Workspace
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
              <div className="mt-3">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <WorkspaceSwitcher
                      currentWorkspaceId={workspaceId}
                      currentWorkspaceName={workspaceName}
                      permissionLevel={permissionLevel}
                    />
                  </div>
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    title="Workspace settings"
                    aria-label="Open workspace settings"
                    className="size-9 shrink-0 rounded-full text-smoke hover:bg-stone hover:text-foreground"
                  >
                    <Link to="/app/workspace/settings">
                      <Settings className="size-4" />
                    </Link>
                  </Button>
                </div>
              </div>
              <p className="m-0 mt-2.5 truncate border-t border-stone pt-2 text-xs text-smoke">
                {userEmail}
              </p>
            </div>
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

      <div className="mt-auto shrink-0 border-t border-stone px-2.5 py-3">
        <div className="flex items-center gap-2">
          <Link
            to="/app/profile"
            title="Open profile"
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 py-2 text-foreground no-underline transition-colors hover:bg-warm-taupe"
          >
            {user.image ? (
              <img
                src={user.image}
                alt={user.name}
                className="size-8 shrink-0 rounded-full object-cover"
              />
            ) : (
              <UserCircle className="size-6 shrink-0 text-smoke" />
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">
                {user.name}
              </span>
              <span className="block truncate text-xs text-smoke">
                {user.email}
              </span>
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              title="Appearance"
              aria-label="Open appearance settings"
              onClick={() => setAppearanceOpen(true)}
              className="size-8 justify-self-center rounded-full text-smoke hover:bg-warm-taupe hover:text-foreground"
            >
              <Palette className="size-4" />
            </Button>
            <Button
              asChild
              variant="ghost"
              size="icon"
              title="What's new"
              aria-label="Open what's new"
              className="size-8 justify-self-center rounded-full text-smoke hover:bg-warm-taupe hover:text-foreground"
            >
              <Link to="/app/changelog">
                <Sparkles className="size-4" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Sign out"
              aria-label="Sign out"
              onClick={handleSignOut}
              className="size-8 justify-self-center rounded-full text-smoke hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
        <AppearanceDialog
          open={appearanceOpen}
          onOpenChange={setAppearanceOpen}
        />
      </div>
    </aside>
  )
})
