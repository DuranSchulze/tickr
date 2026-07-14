import { Link } from '@tanstack/react-router'
import { AlertTriangle, ArrowRight, Clock3 } from 'lucide-react'
import type { WorkspaceSubscriptionAccess } from '#/lib/subscriptions/access'

export type SubscriptionSummary = {
  access: WorkspaceSubscriptionAccess
  plan: { name: string; slug: string }
  permissionLevel: string
}

export function SubscriptionStatusBanner({
  summary,
}: {
  summary: SubscriptionSummary
}) {
  const { access, permissionLevel, plan } = summary
  if (
    (access.reason === 'active' || access.reason === 'exempt') &&
    !access.isReadOnly
  )
    return null
  const isOwner = permissionLevel === 'OWNER'
  const isTrial = access.reason === 'trial'
  const message = isTrial
    ? `${access.daysRemaining} day${access.daysRemaining === 1 ? '' : 's'} left in your ${plan.name} trial.`
    : access.reason === 'past_due'
      ? 'Payment is past due. This workspace is temporarily read-only.'
      : access.reason === 'canceled' && access.canAccess
        ? `Your plan ends in ${access.daysRemaining} day${access.daysRemaining === 1 ? '' : 's'}.`
        : 'This workspace needs an active plan.'

  return (
    <div
      className={`flex min-h-11 flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b px-4 py-2 text-xs font-bold ${isTrial ? 'border-primary/30 bg-primary/10' : 'border-amber-500/40 bg-amber-500/10'}`}
      role={isTrial ? 'status' : 'alert'}
    >
      <span className="inline-flex items-center gap-2">
        {isTrial ? (
          <Clock3 className="size-4 text-primary" aria-hidden="true" />
        ) : (
          <AlertTriangle
            className="size-4 text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          />
        )}
        {message}
      </span>
      {isOwner ? (
        <Link
          to="/app/workspace/billing"
          className="inline-flex items-center gap-1 text-foreground underline decoration-primary decoration-2 underline-offset-4"
        >
          {isTrial ? 'Choose a plan' : 'Open billing'}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      ) : (
        <span className="text-muted-foreground">
          Contact a workspace owner.
        </span>
      )}
    </div>
  )
}
