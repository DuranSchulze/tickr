import { createFileRoute, useRouter } from '@tanstack/react-router'
import { ProfileScreen } from '#/components/time-tracker/WorkspaceScreens'
import { Button } from '#/components/ui/button'
import {
  getSelfProfileFn,
  getTrackerStateLiteFn,
  isImageKitConfiguredFn,
} from '#/lib/server/tracker'

export const Route = createFileRoute('/app/profile')({
  loader: async () => {
    const [state, selfProfile, imagekitConfigured] = await Promise.all([
      getTrackerStateLiteFn(),
      getSelfProfileFn(),
      isImageKitConfiguredFn(),
    ])
    return { state, selfProfile, imagekitConfigured }
  },
  staleTime: 30_000,
  component: ProfileRoute,
})

function ProfileRoute() {
  const { state, selfProfile, imagekitConfigured } = Route.useLoaderData()

  // Defensive guard: if the profile or tracker state came back without the
  // expected shape (e.g. a transient server/session hiccup), show a recoverable
  // state instead of crashing the whole /app shell into its error boundary.
  // The loader types claim these are always present, but we don't trust that at
  // runtime, hence the optional chaining despite the lint rule.
  /* eslint-disable @typescript-eslint/no-unnecessary-condition */
  const member = state?.members?.find((m) => m.id === state.currentMemberId)
  if (!selfProfile?.user || !member) {
    if (typeof console !== 'undefined') {
      console.error('Profile data incomplete', {
        hasSelfProfileUser: !!selfProfile?.user,
        hasMember: !!member,
        currentMemberId: state?.currentMemberId,
      })
    }
    return <ProfileUnavailable />
  }
  /* eslint-enable @typescript-eslint/no-unnecessary-condition */

  return (
    <ProfileScreen
      state={state}
      selfProfile={selfProfile}
      imagekitConfigured={imagekitConfigured}
    />
  )
}

function ProfileUnavailable() {
  const router = useRouter()
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <div>
        <h1 className="m-0 text-2xl font-bold text-foreground">
          We couldn&apos;t load your profile
        </h1>
        <p className="m-0 mt-2 text-sm text-muted-foreground">
          Your account loaded, but the profile details didn&apos;t come through.
          This is usually a temporary hiccup — try again.
        </p>
      </div>
      <Button onClick={() => void router.invalidate()}>Retry</Button>
    </div>
  )
}
