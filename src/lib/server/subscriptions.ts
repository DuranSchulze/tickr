import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

const planSlugSchema = z.enum(['team', 'business'])

export const listSubscriptionPlansFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { listPublicSubscriptionPlans } = await import('./subscriptions.server')
  return listPublicSubscriptionPlans()
})

export const getWorkspaceSubscriptionFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { getCurrentWorkspaceSubscription } =
    await import('./subscriptions.server')
  return getCurrentWorkspaceSubscription()
})

export const createSubscriptionCheckoutFn = createServerFn({ method: 'POST' })
  .inputValidator((input: unknown) =>
    z.object({ planSlug: planSlugSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const { createSubscriptionCheckout } =
      await import('./subscriptions.server')
    return createSubscriptionCheckout(data.planSlug)
  })
