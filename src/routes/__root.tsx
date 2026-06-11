import { lazy, Suspense, useEffect, useState } from 'react'
import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import 'goey-toast/styles.css'
import { Button } from '../components/ui/button'
import { Monitoring } from '../components/dev/Monitoring'

import appCss from '../styles.css?url'
import { BRAND } from '#/lib/brand'

import type { QueryClient } from '@tanstack/react-query'

// The toast library (goey-toast + sonner) is ~190 KB. Mount the toaster only
// after first paint on the client so it never competes with the initial load —
// toasts are triggered by user actions, which can't happen before then.
// Imperative toast calls go through the matching lazy facade in #/lib/toast.
const GooeyToaster = lazy(() =>
  import('goey-toast').then((mod) => ({ default: mod.GooeyToaster })),
)

// oxlint-disable-next-line react/only-export-components
function DeferredToaster() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return (
    <Suspense fallback={null}>
      <GooeyToaster position="top-right" />
    </Suspense>
  )
}

// oxlint-disable-next-line react/only-export-components
function NotFoundComponent() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 text-center">
      <div className="space-y-2">
        <h1 className="text-6xl font-bold text-primary">404</h1>
        <h2 className="text-2xl font-semibold">Page Not Found</h2>
        <p className="text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
      </div>
      <Button asChild>
        <Link to="/app/time-tracker">Go to Time Tracker</Link>
      </Button>
    </div>
  )
}

interface MyRouterContext {
  queryClient: QueryClient
}

// Injected before page paint to prevent theme flicker. Must remain a pure
// static string — never interpolate server or user data into this constant.
const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;var PRIMARY_PRESETS=['teal','violet','blue','emerald','rose','amber'];var primary=window.localStorage.getItem('primary-color');if(PRIMARY_PRESETS.indexOf(primary)===-1){primary='teal'}root.setAttribute('data-primary',primary);}catch(e){}})();`

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
        <HeadContent />
      </head>
      <body className="font-sans antialiased [overflow-wrap:anywhere] selection:bg-primary/20 selection:text-foreground">
        {children}
        <Monitoring />
        <DeferredToaster />
        <Scripts />
      </body>
    </html>
  )
}
