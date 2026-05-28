import { memo, useState } from 'react'
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
  Menu,
  Timer,
  TrendingUp,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTrigger,
} from '#/components/ui/drawer'

type NavItem = {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  exact?: boolean
}

export const MobileNav = memo(function ({
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
  const [open, setOpen] = useState(false)

  function close() {
    setOpen(false)
  }

  const canAccessAnalytics = permissionLevel !== 'EMPLOYEE'
  const isOwnerOrAdmin =
    permissionLevel === 'OWNER' || permissionLevel === 'ADMIN'
  const hasSettingsChildren = settingsChildren.length > 0

  return (
    <Drawer direction="left" open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open navigation"
          className="lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </DrawerTrigger>

      <DrawerContent className="flex flex-col bg-card p-0">
        <div className="flex flex-1 flex-col overflow-y-auto px-2 py-3">
          <div className="mb-3 border border-primary/30 bg-primary/10 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-primary">
                  Workspace
                </p>
                <p className="m-0 mt-0.5 truncate text-sm font-bold text-foreground">
                  {workspaceName}
                </p>
                <p className="m-0 mt-0.5 truncate text-xs text-muted-foreground">
                  {userEmail}
                </p>
              </div>
              <BriefcaseBusiness className="h-4 w-4 shrink-0 text-primary" />
            </div>
          </div>

          <nav className="grid gap-0.5">
            <Link
              to="/app/time-tracker"
              onClick={close}
              className={`flex h-10 w-full items-center gap-3 px-3 text-sm font-semibold transition-colors ${
                timerActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <Timer className="h-4 w-4 shrink-0" />
              <span>Timer</span>
            </Link>

            {canAccessAnalytics && (
              <Link
                to="/app/analytics"
                onClick={close}
                className={`flex h-10 w-full items-center gap-3 px-3 text-sm font-semibold transition-colors ${
                  analyticsActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                <BarChart3 className="h-4 w-4 shrink-0" />
                <span>Analytics</span>
              </Link>
            )}

            <Link
              to="/app/calendar"
              onClick={close}
              className={`flex h-10 w-full items-center gap-3 px-3 text-sm font-semibold transition-colors ${
                calendarActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <CalendarDays className="h-4 w-4 shrink-0" />
              <span>Calendar</span>
            </Link>

            <Link
              to="/app/my-performance"
              onClick={close}
              className={`flex h-10 w-full items-center gap-3 px-3 text-sm font-semibold transition-colors ${
                performanceActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <TrendingUp className="h-4 w-4 shrink-0" />
              <span>My Performance</span>
            </Link>

            <Link
              to="/app/my-workspaces"
              onClick={close}
              className={`flex h-10 w-full items-center gap-3 px-3 text-sm font-semibold transition-colors ${
                workspacesActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <LayoutGrid className="h-4 w-4 shrink-0" />
              <span>My Workspaces</span>
            </Link>

            {isOwnerOrAdmin && (
              <Link
                to="/app/workspace/activity"
                onClick={close}
                className={`flex h-10 w-full items-center gap-3 px-3 text-sm font-semibold transition-colors ${
                  activityActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                <Activity className="h-4 w-4 shrink-0" />
                <span>Team Activity</span>
              </Link>
            )}

            {hasSettingsChildren && (
              <>
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

                {settingsOpen && (
                  <div className="ml-3 mt-0.5 grid gap-0.5 border-l border-border pl-3">
                    {settingsChildren.map((item) => {
                      const Icon = item.icon
                      return (
                        <Link
                          key={item.to}
                          to={item.to as '/app/workspace/members'}
                          onClick={close}
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

        <div className="border-t border-border p-2">
          <DrawerClose asChild>
            <button
              type="button"
              className="flex h-9 w-full items-center justify-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close menu
            </button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  )
})
