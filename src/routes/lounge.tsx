import { createFileRoute, redirect } from '@tanstack/react-router'
import { getSessionFn } from '#/lib/server/session'

export const Route = createFileRoute('/lounge')({
  loader: async () => {
    const session = await getSessionFn()
    if (!session?.user) {
      throw redirect({ to: '/auth' })
    }
    throw redirect({ to: '/onboarding' })
  },
})
