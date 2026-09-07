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
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4 text-center">
      <div className="space-y-2">
        <h1 className="text-6xl font-bold text-primary">404</h1>
        <h2 className="text-2xl font-semibold">Page Not Found</h2>
        <p className="text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
      </div>
      <Button asChild>
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
      <body className="font-sans antialiased [overflow-wrap:anywhere] selection:bg-primary/20 selection:text-foreground">
        {children}
        <Monitoring />
        <ServiceWorkerRegistrar />
        <DeferredToaster />
        <Scripts />
      </body>
    </html>
  )
}
