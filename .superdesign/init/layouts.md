# Layouts

Post-login pages render inside `/app` (`src/routes/app.tsx`) → `AppShell` (sidebar on desktop, mobile nav on small screens, top bar, main content plane `--app-surface`).

## \_\_root.tsx

- Renders: Root document, providers, 404

### `src/routes/__root.tsx`

```tsx
import { lazy, Suspense, useEffect, useState } from 'react'
import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import 'sileo/styles.css'
import { Button } from '../components/ui/button'
import { Monitoring } from '../components/dev/Monitoring'

import appCss from '../styles.css?url'
import { BRAND } from '#/lib/brand'

import type { QueryClient } from '@tanstack/react-query'

// Load the toast renderer after the client mounts to keep it out of the
// initial render. Toast calls use the matching lazy helper in #/lib/toast.
const Toaster = lazy(() =>
  import('sileo').then((mod) => ({ default: mod.Toaster })),
)

// oxlint-disable-next-line react/only-export-components
function DeferredToaster() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return (
    <Suspense fallback={null}>
      <Toaster
        position="top-right"
        options={{
          fill: 'var(--foreground)',
          styles: {
            title: 'text-background!',
            description: 'text-background/80!',
          },
        }}
      />
    </Suspense>
  )
}

// Registers the service worker after the page fully loads so it never
// competes with the initial visit, and only in production builds — a dev
// service worker would serve stale chunks across Vite HMR restarts.
// oxlint-disable-next-line react/only-export-components
function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!import.meta.env.PROD) return
    if (!('serviceWorker' in navigator)) return
    const register = () => {
      void navigator.serviceWorker.register('/sw.js')
    }
    if (document.readyState === 'complete') {
      register()
      return
    }
    window.addEventListener('load', register, { once: true })
    return () => window.removeEventListener('load', register)
  }, [])
  return null
}

// oxlint-disable-next-line react/only-export-components
function NotFoundComponent() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-eggshell p-4 text-center text-foreground">
      <div className="space-y-2">
        <h1 className="font-display text-display text-foreground">404</h1>
        <h2 className="text-2xl text-foreground">Page Not Found</h2>
        <p className="text-smoke">
          The page you're looking for doesn't exist or has been moved.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link to="/app/time-tracker">Go to {BRAND.name}</Link>
      </Button>
    </div>
  )
}

interface MyRouterContext {
  queryClient: QueryClient
}

// Injected before page paint to prevent theme flicker. Must remain a pure
// static string — never interpolate server or user data into this constant.
const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;var PRIMARY_PRESETS=['teal','violet','blue','emerald','rose','amber','pink'];var primary=window.localStorage.getItem('primary-color');if(PRIMARY_PRESETS.indexOf(primary)===-1){primary='teal'}root.setAttribute('data-primary',primary);var FONT_PRESETS=['roboto','dm-sans','inter','nunito','work-sans'];var font=window.localStorage.getItem('font');if(FONT_PRESETS.indexOf(font)===-1){font='roboto'}root.setAttribute('data-font',font);}catch(e){}})();`

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: BRAND.name,
      },
      // iOS standalone ("Add to Home Screen") behavior.
      {
        name: 'mobile-web-app-capable',
        content: 'yes',
      },
      {
        name: 'apple-mobile-web-app-capable',
        content: 'yes',
      },
      {
        name: 'apple-mobile-web-app-status-bar-style',
        content: 'default',
      },
      {
        name: 'apple-mobile-web-app-title',
        content: BRAND.name,
      },
    ],
    links: [
      // Preload the main stylesheet so the browser discovers it earlier in the
      // document <head> before the full <HeadContent /> block is parsed.
      {
        rel: 'preload',
        href: appCss,
        as: 'style',
      },
      {
        rel: 'stylesheet',
        href: appCss,
      },
      {
        rel: 'icon',
        href: '/favicon/favicon.ico',
        sizes: 'any',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: '/favicon/favicon-32x32.png',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '16x16',
        href: '/favicon/favicon-16x16.png',
      },
      {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/favicon/apple-touch-icon.png',
      },
      {
        rel: 'manifest',
        href: '/favicon/site.webmanifest',
      },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFoundComponent,
})

// oxlint-disable-next-line react/only-export-components
function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* The theme init script must run before React hydrates to prevent FOUC */}
        {/* oxlint-disable-next-line react/no-danger */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Both theme-color variants must survive TanStack's meta dedupe
            (same `name` collapses to one), so they are rendered as plain JSX.
            They color the mobile browser / standalone-app chrome and follow
            the system color scheme — the in-app manual theme override cannot
            reach this. */}
        <meta
          name="theme-color"
          media="(prefers-color-scheme: light)"
          content="#f7f5f5"
        />
        <meta
          name="theme-color"
          media="(prefers-color-scheme: dark)"
          content="#161c24"
        />
        <HeadContent />
      </head>
      <body className="font-sans antialiased [overflow-wrap:anywhere] selection:bg-ink/15 selection:text-foreground">
        {children}
        <Monitoring />
        <ServiceWorkerRegistrar />
        <DeferredToaster />
        <Scripts />
      </body>
    </html>
  )
}
```

## app.tsx

- Renders: Authenticated /app layout route: loads workspace access, renders AppShell

### `src/routes/app.tsx`

```tsx
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { AppShell } from '#/components/time-tracker/AppShell'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { getSessionFn } from '#/lib/server/session'
import { getSelfProfileFn } from '#/lib/server/tracker'
import { fetchFreshWorkspaceAuthorization } from '#/lib/time-tracker/workspace-authorization'
import { getWorkspaceSubscriptionFn } from '#/lib/server/subscriptions'
import { ArrowRight, Loader2, ShieldCheck } from 'lucide-react'

export const Route = createFileRoute('/app')({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData({
      queryKey: ['session'],
      queryFn: () => getSessionFn(),
      staleTime: 5 * 60 * 1000,
    })
    if (!session?.user) {
      throw redirect({ to: '/auth' })
    }
    return { session }
  },
  loader: async ({ context }) => {
    try {
      const [access, selfProfile, subscription] = await Promise.all([
        fetchFreshWorkspaceAuthorization(context.queryClient),
        context.queryClient.ensureQueryData({
          queryKey: ['self-profile'],
          queryFn: () => getSelfProfileFn(),
          staleTime: 5 * 60 * 1000,
        }),
        context.queryClient.ensureQueryData({
          queryKey: ['workspace-subscription'],
          queryFn: () => getWorkspaceSubscriptionFn(),
          staleTime: 60 * 1000,
        }),
      ])
      return {
        workspace: {
          id: access.workspace.id,
          name: access.workspace.name,
          timezone: access.workspace.timezone,
        },
        user: {
          id: access.user.id,
          name: access.user.name,
          email: access.user.email,
          image: access.user.image ?? null,
          birthDate: selfProfile.profile?.birthDate ?? '',
        },
        permissionLevel: access.member.permissionLevel,
        permissions: access.member.permissions,
        subscription: {
          access: subscription.access,
          plan: {
            name: subscription.plan.name,
            slug: subscription.plan.slug,
          },
          permissionLevel: access.member.permissionLevel,
        },
      }
    } catch {
      throw redirect({ to: '/onboarding', search: { plan: undefined } })
    }
  },
  staleTime: 0,
  pendingComponent: () => (
    <FullscreenRouteState
      eyebrow="Preparing workspace"
      title="Loading your team's tracker"
      description="We’re pulling your workspace, permissions, and current tracker context together."
      tone="loading"
    />
  ),
  errorComponent: ({ error }) => (
    <FullscreenRouteState
      eyebrow="Workspace unavailable"
      title="We couldn't open this workspace"
      description={
        error instanceof Error ? error.message : 'An unexpected error occurred.'
      }
      tone="error"
    />
  ),
  component: AppRoute,
})

function AppRoute() {
  const data = Route.useLoaderData()
  return (
    <AppShell
      workspace={data.workspace}
      user={data.user}
      permissionLevel={data.permissionLevel}
      permissions={data.permissions}
      subscription={data.subscription}
    />
  )
}

function FullscreenRouteState({
  eyebrow,
  title,
  description,
  tone,
}: {
  eyebrow: string
  title: string
  description: string
  tone: 'loading' | 'error'
}) {
  const isLoading = tone === 'loading'

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-eggshell px-4 py-12">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(circle_at_top,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_55%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklab,var(--border)_35%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--border)_35%,transparent)_1px,transparent_1px)] bg-[size:40px_40px] opacity-40"
      />
      <Card className="relative w-full max-w-xl rounded-xl border border-stone bg-eggshell shadow-[var(--shadow-whisper)] backdrop-blur">
        <CardHeader className="border-b border-stone">
          <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-stone bg-warm-taupe px-2.5 py-1 text-xs font-bold uppercase tracking-[0.18em] text-primary">
            {isLoading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="size-3.5" />
            )}
            {eyebrow}
          </div>
          <CardTitle className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
            {title}
          </CardTitle>
          <CardDescription className="text-base leading-7">
            {isLoading ? (
              description
            ) : (
              <span className="mt-3 block max-h-48 overflow-auto rounded-md border border-stone bg-warm-taupe p-3 font-mono text-sm leading-6 text-smoke break-words whitespace-pre-wrap">
                {description}
              </span>
            )}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <p className="m-0 text-sm text-smoke">
            {isLoading
              ? 'This should only take a moment.'
              : 'You can reopen onboarding to repair workspace access, or return to your account page.'}
          </p>
        </CardContent>

        <CardFooter className="flex flex-wrap gap-3 border-t border-stone">
          <Button asChild>
            <Link to={isLoading ? '/' : '/onboarding'} className="no-underline">
              {isLoading ? 'Back to home' : 'Open onboarding'}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/auth" className="no-underline">
              Account page
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
```

## AppShell.tsx

- Renders: App shell: sidebar + top bar + main content, dialogs mounted here (DailyRecapDialog)

### `src/components/time-tracker/AppShell.tsx`

```tsx
import { useEffect, useMemo, useState } from 'react'
import { Outlet, useRouter, useRouterState } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  BarChart3,
  Building2,
  CalendarClock,
  ClipboardList,
  Cog,
  CreditCard,
  ExternalLink,
  FileText,
  MapPinned,
  Tags,
  TrendingUp,
  Users,
} from 'lucide-react'
import { AppSidebar } from './AppSidebar'
import { BirthdayCelebration } from './BirthdayCelebration'
import { MobileNav } from './MobileNav'
import { fireSideCannons } from '#/components/ui/confetti'
import type { Workspace } from '#/lib/time-tracker/types'
import { SubscriptionStatusBanner } from '#/components/subscription/SubscriptionStatusBanner'
import type { SubscriptionSummary } from '#/components/subscription/SubscriptionStatusBanner'
import { WorkspaceSubscriptionGate } from '#/components/subscription/WorkspaceSubscriptionGate'
import { DailyRecapDialog } from './shared/DailyRecapDialog'
import { TaskSyncCoordinator } from './TaskSyncCoordinator'
import type { EffectivePermissions } from '#/lib/rbac/permissions'
import { workspaceAuthorizationKeys } from '#/lib/time-tracker/workspace-authorization'
import {
  getAppShellLayout,
  getAppShellNavigationState,
} from './app-shell-layout'

type AppShellWorkspace = Pick<Workspace, 'id' | 'name' | 'timezone'>

function EmbedFooter() {
  return (
    <div className="sticky bottom-0 mt-2 flex items-center justify-center border-t border-stone/50 bg-eggshell/80 py-1.5 backdrop-blur-sm">
      <a
        href="/app/time-tracker"
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1 text-xs text-smoke transition-colors hover:text-foreground"
      >
        Open in full app
        <ExternalLink className="size-3" />
      </a>
    </div>
  )
}

export function AppShell({
  workspace,
  user,
  permissionLevel,
  permissions,
  subscription,
}: {
  workspace: AppShellWorkspace
  user: {
    id: string
    name: string
    email: string
    image?: string | null
    birthDate?: string | null
  }
  permissionLevel: string
  permissions: EffectivePermissions
  subscription: SubscriptionSummary
}) {
  const queryClient = useQueryClient()
  const router = useRouter()

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      fetch('/api/health', { keepalive: true }).catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    function refreshAuthorization() {
      void queryClient
        .invalidateQueries({
          queryKey: workspaceAuthorizationKeys.all,
          refetchType: 'none',
        })
        .then(() => router.invalidate())
    }

    window.addEventListener('focus', refreshAuthorization)
    return () => window.removeEventListener('focus', refreshAuthorization)
  }, [queryClient, router])

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
  const { showAppChrome, mainClassName } = getAppShellLayout(pathname, isEmbed)

  const {
    timerActive,
    analyticsGroupActive,
    calendarActive,
    settingsActive,
    billingActive,
  } = getAppShellNavigationState(pathname)

  const [analyticsOpen, setAnalyticsOpen] = useState(analyticsGroupActive)
  const [settingsOpen, setSettingsOpen] = useState(settingsActive)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (!showAppChrome) return

    const storageKey = `tickr:first-open-confetti:${user.id}`

    try {
      if (window.localStorage.getItem(storageKey) === 'seen') return
      window.localStorage.setItem(storageKey, 'seen')
    } catch {
      // Keep going even if storage is unavailable.
    }

    return fireSideCannons()
  }, [showAppChrome, user.id])

  const analyticsChildren = useMemo(() => {
    const items = []
    items.push({
      to: '/app/analytics' as const,
      label: 'Insights',
      icon: BarChart3,
    })
    items.push({
      to: '/app/reports' as const,
      label: 'Reports',
      icon: FileText,
    })
    items.push({
      to: '/app/timesheet' as const,
      label: 'Timesheet',
      icon: CalendarClock,
    })
    items.push({
      to: '/app/my-performance' as const,
      label: 'My Performance',
      icon: TrendingUp,
    })
    if (permissions['activity.view']) {
      items.push({
        to: '/app/workspace/activity' as const,
        label: 'Team Activity',
        icon: Activity,
      })
    }
    if (permissions['locations.view']) {
      items.push({
        to: '/app/workspace/locations' as const,
        label: 'Locations',
        icon: MapPinned,
      })
    }
    if (permissions['members.view']) {
      items.push({
        to: '/app/department-analytics' as const,
        label: 'Department list',
        icon: Building2,
      })
    }
    return items
  }, [permissions])

  const settingsChildren = useMemo(() => {
    const items = []
    if (permissions['members.view']) {
      items.push({
        to: '/app/workspace/members' as const,
        label: 'Members',
        icon: Users,
      })
    }
    if (permissions['catalogs.view']) {
      items.push({
        to: '/app/workspace/catalogs' as const,
        label: 'Catalogs',
        icon: Tags,
      })
    }
    if (permissions['workspace.settings.view']) {
      items.push({
        to: '/app/workspace/settings' as const,
        label: 'Workspace settings',
        icon: Cog,
      })
    }
    if (permissions['audit_logs.view']) {
      items.push({
        to: '/app/audit-logs' as const,
        label: 'Audit Logs',
        icon: ClipboardList,
      })
    }
    if (permissions['billing.manage']) {
      items.push({
        to: '/app/workspace/billing' as const,
        label: 'Billing',
        icon: CreditCard,
      })
    }
    return items
  }, [permissions])

  return (
    <TaskSyncCoordinator workspaceId={workspace.id} pathname={pathname}>
      {showAppChrome && subscription.access.canAccess && (
        <DailyRecapDialog workspaceId={workspace.id} userId={user.id} />
      )}
      <div className="relative flex h-screen w-full flex-col overflow-hidden bg-sidebar text-foreground">
        {showAppChrome && (
          <>
            <BirthdayCelebration
              birthDate={user.birthDate}
              userId={user.id}
              userName={user.name}
            />
            <div className="flex h-14 shrink-0 items-center justify-end border-b border-stone px-3 lg:hidden print:hidden">
              <MobileNav
                workspaceName={workspace.name}
                userEmail={user.email}
                timerActive={timerActive}
                analyticsGroupActive={analyticsGroupActive}
                analyticsOpen={analyticsOpen}
                onToggleAnalytics={() => setAnalyticsOpen((open) => !open)}
                analyticsChildren={analyticsChildren}
                calendarActive={calendarActive}
                settingsActive={settingsActive}
                settingsOpen={settingsOpen}
                onToggleSettings={() => setSettingsOpen((open) => !open)}
                settingsChildren={settingsChildren}
              />
            </div>
          </>
        )}

        {showAppChrome && <SubscriptionStatusBanner summary={subscription} />}

        {!subscription.access.canAccess && !billingActive ? (
          <WorkspaceSubscriptionGate summary={subscription} />
        ) : (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {showAppChrome && (
              <div className="print:hidden">
                <AppSidebar
                  collapsed={collapsed}
                  onToggleCollapsed={() => setCollapsed((c) => !c)}
                  workspaceName={workspace.name}
                  workspaceId={workspace.id}
                  permissionLevel={permissionLevel}
                  user={user}
                  userEmail={user.email}
                  timerActive={timerActive}
                  analyticsGroupActive={analyticsGroupActive}
                  analyticsOpen={analyticsOpen}
                  onToggleAnalytics={() => setAnalyticsOpen((open) => !open)}
                  analyticsChildren={analyticsChildren}
                  calendarActive={calendarActive}
                  settingsActive={settingsActive}
                  settingsOpen={settingsOpen}
                  onToggleSettings={() => setSettingsOpen((open) => !open)}
                  settingsChildren={settingsChildren}
                />
              </div>
            )}

            <main className={mainClassName}>
              <Outlet />
              {isEmbed && <EmbedFooter />}
            </main>
          </div>
        )}
      </div>
    </TaskSyncCoordinator>
  )
}
```

## app-shell-layout.ts

- Renders: Shell layout/navigation-state helpers

### `src/components/time-tracker/app-shell-layout.ts`

```ts
const FULLSCREEN_WORKSPACE_ROUTES = new Set(['/app/workspace/activity/map'])

export function usesFullscreenWorkspaceLayout(pathname: string): boolean {
  return FULLSCREEN_WORKSPACE_ROUTES.has(pathname)
}

export function getAppShellLayout(pathname: string, isEmbed: boolean) {
  const usesFullscreenLayout = usesFullscreenWorkspaceLayout(pathname)

  return {
    usesFullscreenLayout,
    showAppChrome: !isEmbed && !usesFullscreenLayout,
    mainClassName: usesFullscreenLayout
      ? 'min-w-0 flex-1 overflow-hidden p-0'
      : `min-w-0 flex-1 overflow-y-auto overflow-x-hidden rounded-xl bg-app-surface sm:rounded-2xl ${
          isEmbed
            ? 'm-1 p-2'
            : 'mt-1 mr-1 mb-1 ml-0 p-4 sm:mt-2 sm:mr-2 sm:mb-2 sm:p-6'
        }`,
  }
}

export function getAppShellNavigationState(pathname: string) {
  const timerActive = pathname.startsWith('/app/time-tracker')
  const analyticsActive = pathname.startsWith('/app/analytics')
  const reportsActive = pathname.startsWith('/app/reports')
  const timesheetActive = pathname.startsWith('/app/timesheet')
  const performanceActive = pathname.startsWith('/app/my-performance')
  const departmentAnalyticsActive =
    pathname.startsWith('/app/department-analytics') ||
    pathname.startsWith('/app/department-member-analytics')
  const activityActive = pathname.startsWith('/app/workspace/activity')
  const locationsActive = pathname.startsWith('/app/workspace/locations')
  const calendarActive =
    pathname.startsWith('/app/calendar') ||
    pathname.startsWith('/app/department-member-calendar')
  const settingsActive =
    (pathname.startsWith('/app/workspace') &&
      !activityActive &&
      !locationsActive) ||
    pathname.startsWith('/app/audit-logs')

  return {
    timerActive,
    analyticsGroupActive:
      analyticsActive ||
      reportsActive ||
      timesheetActive ||
      performanceActive ||
      departmentAnalyticsActive ||
      activityActive ||
      locationsActive,
    calendarActive,
    settingsActive,
    billingActive: pathname.startsWith('/app/workspace/billing'),
  }
}
```

## AppSidebar.tsx

- Renders: Desktop sidebar navigation (workspace switcher, nav groups, user menu)

### `src/components/time-tracker/AppSidebar.tsx`

```tsx
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
import { AnnouncementCard } from '#/features/announcements/AnnouncementCard'
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
              className="mb-4 flex items-center justify-center px-2 no-underline"
            >
              <AppLogo size="xl" />
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

        <AnnouncementCard collapsed={collapsed} />
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
```

## Navbar.tsx

- Renders: Top navigation bar

### `src/components/time-tracker/Navbar.tsx`

```tsx
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  LogOut,
  Palette,
  Settings,
  Smartphone,
  Sparkles,
  UserCircle,
} from 'lucide-react'
import { WorkspaceSwitcher } from '#/components/layout/WorkspaceSwitcher'
import { AppLogo } from '#/components/ui/AppLogo'
import { AppearanceDialog } from '#/components/settings/AppearanceDialog'
import { InstallAppDialog } from '#/components/shared/InstallAppDialog'
import { authClient } from '#/lib/auth-client'
import { usePwaInstall } from '#/hooks/usePwaInstall'
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
  permissionLevel,
  birthdayCelebration,
  mobileMenuButton,
}: {
  workspace: { id: string; name: string }
  user: {
    id: string
    name: string
    email: string
    image?: string | null
    birthDate?: string | null
  }
  permissionLevel: string
  birthdayCelebration?: ReactNode
  mobileMenuButton?: ReactNode
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [installOpen, setInstallOpen] = useState(false)
  const { canPrompt, isInstalled, isIos, promptInstall } = usePwaInstall()
  // Hidden once installed; on browsers with neither a native install prompt
  // nor iOS instructions there is nothing useful to show.
  const showInstallEntry = !isInstalled && (canPrompt || isIos)

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

  return (
    <header className="sticky top-0 z-40 overflow-hidden border-b border-stone bg-eggshell">
      <div className="relative mx-auto flex h-[4.5rem] max-w-[1600px] items-center gap-4 px-4 py-3 sm:px-6">
        {birthdayCelebration}

        {mobileMenuButton}
        <Link to="/app/time-tracker" className="flex items-center no-underline">
          <AppLogo size="md" />
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full bg-warm-taupe px-3 py-1.5 text-xs font-medium text-smoke lg:inline-flex">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--primary)] opacity-70" />
              <span className="relative inline-flex size-2.5 rounded-full bg-[var(--primary)]" />
            </span>
            Workspace live
          </div>

          <WorkspaceSwitcher
            currentWorkspaceId={workspace.id}
            currentWorkspaceName={workspace.name}
            permissionLevel={permissionLevel}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                title="Account & appearance"
                className="rounded-full border border-stone bg-eggshell text-smoke hover:bg-warm-taupe hover:text-foreground overflow-hidden"
              >
                {user.image ? (
                  <img
                    src={user.image}
                    alt={user.name}
                    className="size-full rounded-full object-cover"
                  />
                ) : (
                  <UserCircle className="size-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>
                <p className="m-0 text-sm font-semibold text-foreground">
                  {user.name}
                </p>
                <p className="m-0 text-xs font-normal text-smoke truncate">
                  {user.email}
                </p>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              <DropdownMenuItem asChild>
                <Link to="/app/profile" className="flex items-center gap-2">
                  <Settings className="size-4" />
                  Profile settings
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem asChild>
                <Link to="/app/changelog" className="flex items-center gap-2">
                  <Sparkles className="size-4" />
                  What's new
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem
                onSelect={() => setAppearanceOpen(true)}
                className="flex items-center gap-2"
              >
                <Palette className="size-4" />
                Appearance
              </DropdownMenuItem>

              {showInstallEntry && (
                <DropdownMenuItem
                  onSelect={() => setInstallOpen(true)}
                  className="flex items-center gap-2"
                >
                  <Smartphone className="size-4" />
                  Install app
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onSelect={handleSignOut}
                className="flex items-center gap-2 text-destructive focus:text-destructive"
              >
                <LogOut className="size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <AppearanceDialog
            open={appearanceOpen}
            onOpenChange={setAppearanceOpen}
          />

          {showInstallEntry && (
            <InstallAppDialog
              open={installOpen}
              onOpenChange={setInstallOpen}
              canPrompt={canPrompt}
              isIos={isIos}
              promptInstall={promptInstall}
            />
          )}
        </div>
      </div>
    </header>
  )
}
```

## MobileNav.tsx

- Renders: Mobile navigation (sheet/drawer)

### `src/components/time-tracker/MobileNav.tsx`

```tsx
import { memo, useState } from 'react'
import type { ComponentType } from 'react'
import { Link } from '@tanstack/react-router'
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  Cog,
  Menu,
  Timer,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from '#/components/ui/drawer'
import { AppLogo } from '#/components/ui/AppLogo'

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
  const [open, setOpen] = useState(false)

  function close() {
    setOpen(false)
  }

  const hasAnalyticsChildren = analyticsChildren.length > 0
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
          <Menu className="size-5" />
        </Button>
      </DrawerTrigger>

      <DrawerContent className="flex flex-col bg-eggshell p-0">
        <DrawerTitle className="sr-only">Mobile navigation</DrawerTitle>
        <DrawerDescription className="sr-only">
          Primary workspace navigation links.
        </DrawerDescription>
        <div className="flex flex-1 flex-col overflow-y-auto px-2 py-3">
          <div className="mb-3 rounded-xl border border-stone bg-warm-taupe px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-graphite">
                  Workspace
                </p>
                <p className="m-0 mt-0.5 truncate text-sm font-bold text-foreground">
                  {workspaceName}
                </p>
                <p className="m-0 mt-0.5 truncate text-xs text-smoke">
                  {userEmail}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <AppLogo size="sm" />
                <BriefcaseBusiness className="size-4 text-primary" />
              </div>
            </div>
          </div>

          <nav className="grid gap-0.5">
            <Link
              to="/app/time-tracker"
              onClick={close}
              className={`flex h-10 w-full items-center gap-3 rounded-full px-3 text-sm font-semibold transition-colors ${
                timerActive
                  ? 'bg-stone text-foreground [&_svg]:text-primary'
                  : 'text-smoke hover:bg-warm-taupe hover:text-foreground'
              }`}
            >
              <Timer className="size-4 shrink-0" />
              <span>Timer</span>
            </Link>

            <Link
              to="/app/calendar"
              onClick={close}
              className={`flex h-10 w-full items-center gap-3 rounded-full px-3 text-sm font-semibold transition-colors ${
                calendarActive
                  ? 'bg-stone text-foreground [&_svg]:text-primary'
                  : 'text-smoke hover:bg-warm-taupe hover:text-foreground'
              }`}
            >
              <CalendarDays className="size-4 shrink-0" />
              <span>Calendar</span>
            </Link>

            {hasAnalyticsChildren && (
              <>
                <button
                  type="button"
                  onClick={onToggleAnalytics}
                  className={`mt-1 flex w-full items-center gap-3 rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
                    analyticsGroupActive && !analyticsOpen
                      ? 'bg-stone text-foreground [&_svg]:text-primary'
                      : analyticsGroupActive
                        ? 'bg-stone/60 text-foreground [&_svg]:text-primary'
                        : 'text-smoke hover:bg-warm-taupe hover:text-foreground'
                  }`}
                >
                  <BarChart3 className="size-4 shrink-0" />
                  <span className="flex-1 text-left">Analytics</span>
                  <ChevronDown
                    className={`size-3.5 shrink-0 transition-transform duration-200 ${
                      analyticsOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {analyticsOpen && (
                  <div className="ml-3 mt-0.5 grid gap-0.5 border-l border-stone pl-3">
                    {analyticsChildren.map((item) => {
                      const Icon = item.icon
                      return (
                        <Link
                          key={item.to}
                          to={item.to as '/app/analytics'}
                          onClick={close}
                          className="flex items-center gap-3 rounded-full px-3 py-2 text-sm font-semibold text-smoke no-underline hover:bg-warm-taupe hover:text-foreground"
                          activeProps={{
                            className:
                              'flex items-center gap-3 rounded-full bg-stone px-3 py-2 text-sm font-semibold text-foreground no-underline [&_svg]:text-primary',
                          }}
                        >
                          <Icon className="size-4" />
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
                <button
                  type="button"
                  onClick={onToggleSettings}
                  className={`mt-1 flex w-full items-center gap-3 rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
                    settingsActive && !settingsOpen
                      ? 'bg-stone text-foreground [&_svg]:text-primary'
                      : settingsActive
                        ? 'bg-stone/60 text-foreground [&_svg]:text-primary'
                        : 'text-smoke hover:bg-warm-taupe hover:text-foreground'
                  }`}
                >
                  <Cog className="size-4 shrink-0" />
                  <span className="flex-1 text-left">Settings</span>
                  <ChevronDown
                    className={`size-3.5 shrink-0 transition-transform duration-200 ${
                      settingsOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {settingsOpen && (
                  <div className="ml-3 mt-0.5 grid gap-0.5 border-l border-stone pl-3">
                    {settingsChildren.map((item) => {
                      const Icon = item.icon
                      return (
                        <Link
                          key={item.to}
                          to={item.to as '/app/workspace/members'}
                          onClick={close}
                          className="flex items-center gap-3 rounded-full px-3 py-2 text-sm font-semibold text-smoke no-underline hover:bg-warm-taupe hover:text-foreground"
                          activeProps={{
                            className:
                              'flex items-center gap-3 rounded-full bg-stone px-3 py-2 text-sm font-semibold text-foreground no-underline [&_svg]:text-primary',
                          }}
                        >
                          <Icon className="size-4" />
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

        <div className="border-t border-stone p-2">
          <DrawerClose asChild>
            <button
              type="button"
              className="flex h-9 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold text-smoke transition-colors hover:bg-warm-taupe hover:text-foreground"
            >
              Close menu
            </button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  )
})
```

## Page.tsx

- Renders: Page wrapper (title/description/actions) used by screens

### `src/components/time-tracker/screens/shared/Page.tsx`

```tsx
import type { ReactNode } from 'react'

export function Page({
  title,
  eyebrow,
  children,
}: {
  title: string
  eyebrow: string
  children: ReactNode
}) {
  return (
    <div className="grid min-w-0 gap-6">
      <div>
        <p className="m-0 text-sm font-semibold text-primary">{eyebrow}</p>
        <h1 className="m-0 font-display text-heading-sm mt-1 text-foreground">
          {title}
        </h1>
      </div>
      {children}
    </div>
  )
}
```
