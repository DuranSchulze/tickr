export type WorkspaceSubscriptionStatus =
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'EXPIRED'

export type SubscriptionAccessInput = {
  billingExempt?: boolean
  status: WorkspaceSubscriptionStatus
  trialEndsAt: Date | string | null
  currentPeriodEndsAt: Date | string
  cancelAtPeriodEnd: boolean
}

export type WorkspaceSubscriptionAccess = {
  canAccess: boolean
  isReadOnly: boolean
  reason: 'exempt' | 'trial' | 'active' | 'past_due' | 'canceled' | 'expired'
  daysRemaining: number
}

const DAY_MS = 86_400_000

export function deriveWorkspaceSubscriptionAccess(
  subscription: SubscriptionAccessInput,
  now = new Date(),
): WorkspaceSubscriptionAccess {
  if (subscription.billingExempt) {
    return {
      canAccess: true,
      isReadOnly: false,
      reason: 'exempt',
      daysRemaining: 0,
    }
  }

  const periodEnd = new Date(subscription.currentPeriodEndsAt)
  const trialEnd = subscription.trialEndsAt
    ? new Date(subscription.trialEndsAt)
    : null
  const relevantEnd =
    subscription.status === 'TRIALING' && trialEnd ? trialEnd : periodEnd
  const daysRemaining = Math.max(
    0,
    Math.ceil((relevantEnd.getTime() - now.getTime()) / DAY_MS),
  )

  if (subscription.status === 'TRIALING' && trialEnd && trialEnd > now) {
    return {
      canAccess: true,
      isReadOnly: false,
      reason: 'trial',
      daysRemaining,
    }
  }

  if (subscription.status === 'ACTIVE' && periodEnd > now) {
    return {
      canAccess: true,
      isReadOnly: false,
      reason: 'active',
      daysRemaining,
    }
  }

  if (subscription.status === 'CANCELED' && periodEnd > now) {
    return {
      canAccess: true,
      isReadOnly: false,
      reason: 'canceled',
      daysRemaining,
    }
  }

  if (subscription.status === 'PAST_DUE') {
    return {
      canAccess: true,
      isReadOnly: true,
      reason: 'past_due',
      daysRemaining: 0,
    }
  }

  return {
    canAccess: false,
    isReadOnly: true,
    reason: subscription.status === 'CANCELED' ? 'canceled' : 'expired',
    daysRemaining: 0,
  }
}
