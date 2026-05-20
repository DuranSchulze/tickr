import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { GooeyToaster } from 'goey-toast'
import 'goey-toast/styles.css'
import { Button } from '../components/ui/button'

import appCss from '../styles.css?url'
import { BRAND } from '#/lib/brand'

import type { QueryClient } from '@tanstack/react-query'

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

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="font-sans antialiased [overflow-wrap:anywhere] selection:bg-primary/20 selection:text-foreground">
        {children}
        <GooeyToaster position="top-right" />
        <Scripts />
      </body>
    </html>
  )
}
