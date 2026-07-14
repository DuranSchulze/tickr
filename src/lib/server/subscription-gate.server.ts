import '@tanstack/react-start/server-only'
import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { subscriptions, workspaces } from '#/db/schema'
import { deriveWorkspaceSubscriptionAccess } from '#/lib/subscriptions/access'

export class SubscriptionWriteAccessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SubscriptionWriteAccessError'
  }
}

export async function assertWorkspaceWriteAccess(workspaceId: string) {
  const [row] = await db
    .select({
      subscription: subscriptions,
      billingExempt: workspaces.billingExempt,
    })
    .from(subscriptions)
    .innerJoin(workspaces, eq(subscriptions.workspaceId, workspaces.id))
    .where(eq(subscriptions.workspaceId, workspaceId))
    .limit(1)

  if (!row) {
    throw new SubscriptionWriteAccessError(
      'This workspace does not have a subscription. Ask its owner to open Billing.',
    )
  }

  const state = deriveWorkspaceSubscriptionAccess({
    ...row.subscription,
    billingExempt: row.billingExempt,
  })
  if (!state.canAccess || state.isReadOnly) {
    throw new SubscriptionWriteAccessError(
      state.reason === 'past_due'
        ? 'This workspace is read-only until its payment is resolved.'
        : 'This workspace trial or subscription has ended. Ask its owner to choose a plan.',
    )
  }
}
