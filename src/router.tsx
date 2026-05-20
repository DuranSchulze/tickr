import {
  createRouter as createTanStackRouter,
  Link,
} from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { Button } from './components/ui/button'
import { Loader2 } from 'lucide-react'

import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { getContext } from './integrations/tanstack-query/root-provider'

function DefaultNotFoundComponent() {
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

function DefaultPendingComponent() {
  return (
    <div className="flex min-h-[200px] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}

export function getRouter() {
  const context = getContext()

  const router = createTanStackRouter({
    routeTree,
    context,
    scrollRestoration: true,
    // 'intent' preloading fires route loaders on hover, which triggers DB
    // queries on every sidebar mouseover and makes the page unresponsive.
    // Disabled here because routes already have staleTime caching — navigating
    // to a recently-visited route is instant without any preload overhead.
    defaultPreload: false,
    defaultPendingMs: 500,
    defaultPendingMinMs: 200,
    defaultPendingComponent: DefaultPendingComponent,
    defaultNotFoundComponent: DefaultNotFoundComponent,
  })

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
