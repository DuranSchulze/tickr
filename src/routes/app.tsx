import { useEffect } from 'react'
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
import { OFFLINE_SHELL_PARAM } from '#/lib/time-tracker/offline-shell'
import { isNetworkError } from '#/lib/time-tracker/connectivity'
import {
  OfflineGateError,
  bootFromSnapshot,
  rememberOnlineSession,
} from '#/lib/time-tracker/offline-boot'
import { OfflineSignInGate } from '#/components/time-tracker/offline/OfflineSignInGate'
import { completePendingSignOut } from '#/components/time-tracker/offline/useSignOut'
import { isSignOutPending } from '#/lib/time-tracker/offline-wipe'
import { OfflineBanner } from '#/components/time-tracker/offline/OfflineBanner'

type AppLoaderData = {
  workspace: { id: string; name: string; timezone: string }
  /** The signed-in member's id in this workspace (offline owner). */
  memberId: string
  user: {
    id: string
    name: string
    email: string
    image: string | null
    birthDate: string
  }
  permissionLevel: Awaited<
    ReturnType<typeof fetchFreshWorkspaceAuthorization>
  >['member']['permissionLevel']
  permissions: Awaited<
    ReturnType<typeof fetchFreshWorkspaceAuthorization>
  >['member']['permissions']
  subscription: {
    access: Awaited<ReturnType<typeof getWorkspaceSubscriptionFn>>['access']
    plan: { name: string; slug: string }
    permissionLevel: Awaited<
      ReturnType<typeof fetchFreshWorkspaceAuthorization>
    >['member']['permissionLevel']
  }
}

const isClient = () => typeof window !== 'undefined'

/**
 * A request that never reached the server (offline-mode REQ-6). Only these
 * open the app from the offline snapshot; an authorization answer from the
 * server keeps its normal redirect.
 */
function failedOffline(err: unknown) {
  return isClient() && isNetworkError(err)
}

export const Route = createFileRoute('/app')({
  // The service worker caches `/app/...?offline-shell=1` as the offline boot
  // document (offline-mode REQ-6, decision Q2): rendered without loaders, so
  // it carries no user data. Normal visits keep full server rendering.
  ssr: ({ search }) =>
    search.status === 'success' &&
    (search.value as Record<string, unknown>)[OFFLINE_SHELL_PARAM] !== undefined
      ? false
      : true,
  beforeLoad: async ({ context }) => {
    // Without a connection, never ask the server: a failed request must not
    // look like a signed-out session.
    if (isClient() && !navigator.onLine) {
      return {
        session: null,
        offlineSnapshot: await bootFromSnapshot<AppLoaderData>(
          context.queryClient,
        ),
      }
    }
    // Logged out while offline: finish ending the server session first.
    if (isClient() && isSignOutPending()) {
      await completePendingSignOut()
      throw redirect({ to: '/auth' })
    }
    let session
    try {
      session = await context.queryClient.ensureQueryData({
        queryKey: ['session'],
        queryFn: () => getSessionFn(),
        staleTime: 5 * 60 * 1000,
      })
    } catch (err) {
      if (!failedOffline(err)) throw err
      return {
        session: null,
        offlineSnapshot: await bootFromSnapshot<AppLoaderData>(
          context.queryClient,
        ),
      }
    }
    if (!session?.user) {
      throw redirect({ to: '/auth' })
    }
    return { session, offlineSnapshot: null }
  },
  loader: async ({
    context,
  }): Promise<AppLoaderData & { offline: boolean }> => {
    if (context.offlineSnapshot) {
      return { ...context.offlineSnapshot.data, offline: true }
    }
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
      const data: AppLoaderData = {
        memberId: access.member.id,
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
      return { ...data, offline: false }
    } catch (err) {
      if (failedOffline(err)) {
        const snapshot = await bootFromSnapshot<AppLoaderData>(
          context.queryClient,
        )
        return { ...snapshot.data, offline: true }
      }
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
  errorComponent: ({ error }) =>
    error instanceof OfflineGateError ? (
      <OfflineSignInGate error={error} />
    ) : (
      <FullscreenRouteState
        eyebrow="Workspace unavailable"
        title="We couldn't open this workspace"
        description={
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred.'
        }
        tone="error"
      />
    ),
  component: AppRoute,
})

function AppRoute() {
  const data = Route.useLoaderData()
  // Runs on the client after both server-rendered and client loads, so every
  // successful online visit refreshes the offline snapshot (REQ-6).
  useEffect(() => {
    if (data.offline) return
    const { offline: _offline, ...snapshot } = data
    rememberOnlineSession(
      data.workspace.id,
      data.memberId,
      data.user.id,
      snapshot,
    )
  }, [data])
  return (
    <>
      <OfflineBanner bootedOffline={data.offline} />
      <AppShell
        workspace={data.workspace}
        user={data.user}
        permissionLevel={data.permissionLevel}
        permissions={data.permissions}
        subscription={data.subscription}
      />
    </>
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
