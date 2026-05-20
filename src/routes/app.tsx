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
import { getWorkspaceAccessFn } from '#/lib/server/workspace-access'
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
      const access = await context.queryClient.ensureQueryData({
        queryKey: ['workspace-access'],
        queryFn: () => getWorkspaceAccessFn(),
        staleTime: 5 * 60 * 1000,
      })
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
        },
        permissionLevel: access.member.permissionLevel,
      }
    } catch {
      throw redirect({ to: '/onboarding' })
    }
  },
  staleTime: 5 * 60 * 1000,
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(circle_at_top,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_55%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklab,var(--border)_35%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--border)_35%,transparent)_1px,transparent_1px)] bg-[size:40px_40px] opacity-40"
      />
      <Card className="relative w-full max-w-xl rounded-md border-border/80 bg-card/95 shadow-lg backdrop-blur">
        <CardHeader className="border-b border-border">
          <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-bold uppercase tracking-[0.18em] text-primary">
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
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
              <span className="mt-3 block max-h-48 overflow-auto rounded-md border border-border bg-muted p-3 font-mono text-sm leading-6 text-muted-foreground break-words whitespace-pre-wrap">
                {description}
              </span>
            )}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <p className="m-0 text-sm text-muted-foreground">
            {isLoading
              ? 'This should only take a moment.'
              : 'You can reopen onboarding to repair workspace access, or return to your account page.'}
          </p>
        </CardContent>

        <CardFooter className="flex flex-wrap gap-3 border-t border-border">
          <Button asChild>
            <Link to={isLoading ? '/' : '/onboarding'} className="no-underline">
              {isLoading ? 'Back to home' : 'Open onboarding'}
              <ArrowRight className="h-4 w-4" />
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
