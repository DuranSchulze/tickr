import { createFileRoute } from '@tanstack/react-router'
import { ProfileScreen } from '#/components/time-tracker/WorkspaceScreens'
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
  return (
    <ProfileScreen
      state={state}
      selfProfile={selfProfile}
      imagekitConfigured={imagekitConfigured}
    />
  )
}
