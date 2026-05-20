import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  Check,
  CircleHelp,
  LogOut,
  Moon,
  Settings,
  Sparkles,
  Sun,
  UserCircle,
} from 'lucide-react'
import { WorkspaceSwitcher } from '#/components/layout/WorkspaceSwitcher'
import { AppLogo } from '#/components/ui/AppLogo'
import { authClient } from '#/lib/auth-client'
import { useAnnouncementContext } from '#/features/announcements/AnnouncementProvider'
import { BRAND } from '#/lib/brand'
import {
  applyPrimaryColor,
  applyTheme,
  DEFAULT_PRIMARY,
  getStoredPrimaryColor,
  getStoredTheme,
  isPrimaryColorId,
  PRIMARY_COLORS,
} from '#/lib/theme'
import type { PrimaryColorId, ThemeMode } from '#/lib/theme'
import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'

export function Navbar({
  workspace,
  user,
  mobileMenuButton,
}: {
  workspace: { name: string }
  user: { id: string; name: string; email: string; image?: string | null }
  mobileMenuButton?: ReactNode
}) {
  const navigate = useNavigate()
  const [theme, setTheme] = useState<ThemeMode>('light')
  const [color, setColor] = useState<PrimaryColorId>(DEFAULT_PRIMARY)

  useEffect(() => {
    setTheme(getStoredTheme())
    setColor(getStoredPrimaryColor())
    function onThemeChange(event: Event) {
      const detail = (event as CustomEvent<unknown>).detail
      if (detail === 'light' || detail === 'dark') setTheme(detail)
    }
    function onColorChange(event: Event) {
      const detail = (event as CustomEvent<unknown>).detail
      if (isPrimaryColorId(detail)) setColor(detail)
    }
    window.addEventListener('theme-change', onThemeChange)
    window.addEventListener('primary-color-change', onColorChange)
    return () => {
      window.removeEventListener('theme-change', onThemeChange)
      window.removeEventListener('primary-color-change', onColorChange)
    }
  }, [])

  function selectMode(next: ThemeMode) {
    applyTheme(next)
    setTheme(next)
  }

  function selectColor(id: PrimaryColorId) {
    applyPrimaryColor(id)
    setColor(id)
  }

  const { showOnboarding } = useAnnouncementContext()

  const [infoOpen, setInfoOpen] = useState(false)

  const handleSignOut = () => {
    void authClient.signOut({
      fetchOptions: {
        onSuccess: () => void navigate({ to: '/auth' }),
      },
    })
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-[4.5rem] max-w-[1600px] items-center gap-4 px-4 py-3 sm:px-6">
        {mobileMenuButton}
        <Link
          to="/app/time-tracker"
          className="flex items-center gap-3 no-underline"
        >
          <AppLogo size="md" />
          <div className="hidden sm:block">
            <p className="m-0 text-sm font-black uppercase tracking-[0.18em] text-foreground">
              {BRAND.name}
            </p>
            <p className="m-0 text-xs text-muted-foreground">{BRAND.tagline}</p>
          </div>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-border/70 bg-card/80 px-3 py-2 text-xs font-semibold text-muted-foreground lg:inline-flex">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--primary)] opacity-70" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--primary)]" />
            </span>
            Workspace live
          </div>

          <WorkspaceSwitcher currentWorkspaceName={workspace.name} />

          <DropdownMenu open={infoOpen} onOpenChange={setInfoOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                title="What's new &amp; help"
                className="rounded-full bg-card/80 text-muted-foreground hover:text-foreground"
              >
                <CircleHelp className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Info &amp; Updates
              </DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() => {
                  setInfoOpen(false)
                  showOnboarding()
                }}
              >
                <CircleHelp className="h-4 w-4" />
                Tour the app
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  to="/app/changelog"
                  className="flex items-center gap-2"
                  onClick={() => setInfoOpen(false)}
                >
                  <Sparkles className="h-4 w-4" />
                  What's new
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                title="Account & appearance"
                className="rounded-full bg-card/80 text-muted-foreground hover:text-foreground overflow-hidden"
              >
                {user.image ? (
                  <img
                    src={user.image}
                    alt={user.name}
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  <UserCircle className="h-4 w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>
                <p className="m-0 text-sm font-semibold text-foreground">
                  {user.name}
                </p>
                <p className="m-0 text-xs font-normal text-muted-foreground truncate">
                  {user.email}
                </p>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              <DropdownMenuItem asChild>
                <Link to="/app/profile" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Profile settings
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Theme
              </DropdownMenuLabel>
              <div className="px-1 pb-1">
                <div
                  role="radiogroup"
                  aria-label="Theme mode"
                  className="grid grid-cols-2 gap-1 rounded-md border border-border bg-muted/60 p-1"
                >
                  <ModePill
                    active={theme === 'light'}
                    onClick={() => selectMode('light')}
                    icon={<Sun className="h-3.5 w-3.5" />}
                    label="Light"
                  />
                  <ModePill
                    active={theme === 'dark'}
                    onClick={() => selectMode('dark')}
                    icon={<Moon className="h-3.5 w-3.5" />}
                    label="Dark"
                  />
                </div>
              </div>

              <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Accent
              </DropdownMenuLabel>
              <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2">
                {PRIMARY_COLORS.map((c) => {
                  const isActive = c.id === color
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      aria-label={c.label}
                      title={c.label}
                      onClick={() => selectColor(c.id)}
                      className={cn(
                        'relative h-6 w-6 rounded-full border-2 transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        isActive
                          ? 'border-foreground scale-110'
                          : 'border-transparent hover:scale-105',
                      )}
                      style={{ backgroundColor: c.swatch }}
                    >
                      {isActive && (
                        <Check
                          className="absolute inset-0 m-auto h-3 w-3 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]"
                          strokeWidth={3}
                        />
                      )}
                    </button>
                  )
                })}
              </div>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onSelect={handleSignOut}
                className="flex items-center gap-2 text-destructive focus:text-destructive"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}

function ModePill({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded py-1.5 text-xs font-semibold transition-colors',
        active
          ? 'bg-card text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
