import { useState } from 'react'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import {
  ArrowLeft,
  Check,
  CreditCard,
  Loader2,
  ReceiptText,
} from 'lucide-react'
import {
  createSubscriptionCheckoutFn,
  getWorkspaceSubscriptionFn,
  listSubscriptionPlansFn,
} from '#/lib/server/subscriptions'
import { gooeyToast } from '#/lib/toast'

type BillingSearch = {
  plan?: 'team' | 'business'
  checkout?: 'success' | 'canceled'
}

export const Route = createFileRoute('/app/workspace/billing')({
  validateSearch: (search: Record<string, unknown>): BillingSearch => ({
    plan:
      search.plan === 'team' || search.plan === 'business'
        ? search.plan
        : undefined,
    checkout:
      search.checkout === 'success' || search.checkout === 'canceled'
        ? search.checkout
        : undefined,
  }),
  loader: async () => {
    const [billing, plans] = await Promise.all([
      getWorkspaceSubscriptionFn(),
      listSubscriptionPlansFn(),
    ])
    if (!billing.permissions['billing.manage']) {
      throw redirect({ to: '/app/time-tracker' })
    }
    return { billing, plans }
  },
  component: BillingPage,
})

function BillingPage() {
  const { billing, plans } = Route.useLoaderData()
  const search = Route.useSearch()
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)

  async function checkout(planSlug: 'team' | 'business') {
    setLoadingPlan(planSlug)
    try {
      const result = await createSubscriptionCheckoutFn({ data: { planSlug } })
      window.location.assign(result.checkoutUrl)
    } catch (error) {
      gooeyToast.error('Could not open checkout', {
        description:
          error instanceof Error ? error.message : 'Please try again.',
      })
      setLoadingPlan(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl pb-12">
      <Link
        to="/app/workspace/settings"
        className="mb-5 inline-flex items-center gap-2 text-xs font-bold text-muted-foreground no-underline hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Workspace settings
      </Link>
      <header className="border border-border bg-card p-6 shadow-[6px_6px_0_color-mix(in_oklab,var(--border)_65%,transparent)] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">
              Owner billing
            </p>
            <h1 className="mt-2 font-heading text-3xl font-black tracking-[-0.04em] text-foreground sm:text-4xl">
              Plan and payment
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Plans cover the whole workspace. Checkout is securely hosted by
              Xendit, and only workspace owners can make billing changes.
            </p>
          </div>
          <div className="min-w-48 border border-border bg-background p-4">
            <p className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-muted-foreground">
              Current plan
            </p>
            <p className="mt-1 text-xl font-black text-foreground">
              {billing.plan.name}
            </p>
            <p className="mt-1 text-xs font-bold uppercase text-primary">
              {billing.access.reason === 'exempt'
                ? 'Forever free · billing exempt'
                : billing.subscription.status.replace('_', ' ')}
            </p>
          </div>
        </div>
      </header>

      {search.checkout ? (
        <div
          className={`mt-6 border p-4 text-sm font-bold ${search.checkout === 'success' ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200' : 'border-amber-500/50 bg-amber-500/10'}`}
          role="status"
        >
          {search.checkout === 'success'
            ? 'Checkout completed. Xendit is confirming the subscription; this page will update after the webhook arrives.'
            : 'Checkout was canceled. Your current access has not changed.'}
        </div>
      ) : null}

      <section className="mt-8">
        <h2 className="text-xl font-black text-foreground">Available plans</h2>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          {plans.map((plan) => {
            const isSelected = search.plan === plan.slug
            const isCurrent = billing.plan.id === plan.id
            return (
              <article
                key={plan.id}
                className={`flex flex-col border p-6 ${isSelected ? 'border-primary bg-primary/[0.05] shadow-[6px_6px_0_color-mix(in_oklab,var(--primary)_22%,transparent)]' : 'border-border bg-card'}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">
                      Monthly workspace plan
                    </p>
                    <h3 className="mt-2 text-2xl font-black text-foreground">
                      {plan.name}
                    </h3>
                  </div>
                  {isCurrent ? (
                    <span className="border border-border bg-background px-2 py-1 text-[0.65rem] font-black uppercase text-muted-foreground">
                      Current
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {plan.tagline}
                </p>
                <p className="mt-6 text-4xl font-black tracking-tight text-foreground">
                  ${(plan.monthlyPriceCents / 100).toFixed(0)}
                  <span className="ml-2 text-sm text-muted-foreground">
                    / month
                  </span>
                </p>
                <ul className="mt-6 grid flex-1 gap-3 p-0 text-sm text-foreground">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-3">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => checkout(plan.slug as 'team' | 'business')}
                  disabled={
                    loadingPlan !== null || billing.access.reason === 'exempt'
                  }
                  className="mt-7 inline-flex min-h-11 items-center justify-center gap-2 border border-primary bg-primary px-5 text-sm font-black text-primary-foreground disabled:cursor-wait disabled:opacity-60"
                >
                  {loadingPlan === plan.slug ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CreditCard className="size-4" />
                  )}
                  {billing.access.reason === 'exempt'
                    ? 'Forever free workspace'
                    : isCurrent && billing.subscription.status === 'ACTIVE'
                      ? `Renew ${plan.name}`
                      : `Pay for ${plan.name}`}
                </button>
              </article>
            )
          })}
        </div>
      </section>

      <section className="mt-10 border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border p-5">
          <ReceiptText className="size-5 text-primary" />
          <h2 className="text-lg font-black text-foreground">
            Billing history
          </h2>
        </div>
        {billing.invoices.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No checkout or payment records yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-muted text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Reference</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {billing.invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-t border-border">
                    <td className="px-5 py-4">
                      {new Date(invoice.createdAt).toLocaleDateString('en-US', {
                        timeZone: 'UTC',
                      })}
                    </td>
                    <td className="px-5 py-4 font-mono text-xs">
                      {invoice.xenditReferenceId}
                    </td>
                    <td className="px-5 py-4 font-bold">
                      ${(invoice.amountCents / 100).toFixed(2)}{' '}
                      {invoice.currency}
                    </td>
                    <td className="px-5 py-4 font-black">{invoice.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
