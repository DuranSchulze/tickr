import { Link } from '@tanstack/react-router'
import { ArrowRight, Check, Lightbulb, Sparkles } from 'lucide-react'
import { PLAN_PREVIEWS } from '#/lib/landing-content'
import type { LandingPricingPlan } from '#/lib/landing-content'

export function PricingPreview({
  isLoggedIn,
  plans = PLAN_PREVIEWS,
}: {
  isLoggedIn: boolean
  plans?: readonly LandingPricingPlan[]
}) {
  const recommended = plans.find((p) => p.highlighted)
  const others = plans.filter((p) => !p.highlighted)
  const isEmpty = plans.length === 0

  return (
    <section
      id="pricing"
      className="landing-section scroll-mt-24 border-b border-stone bg-warm-taupe"
    >
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
        {/* ── Header ── */}
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-stone bg-eggshell px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-graphite">
            <Sparkles className="size-3" aria-hidden="true" />
            {isEmpty ? 'Coming soon' : 'Pick your plan'}
          </span>
          <h2 className="mt-5 text-balance font-display text-heading text-foreground sm:text-5xl">
            {isEmpty
              ? 'Better pricing is taking shape.'
              : 'Find the fit for your team.'}
          </h2>
          <p className="mt-4 text-base leading-7 text-smoke">
            {isEmpty
              ? 'We are working through the fairest plans, strongest features, and best overall deal for every team.'
              : 'Two clear options — one for teams getting organised, one for teams that already run a tight ship.'}
          </p>
        </div>

        {/* ── Empty state ── */}
        {isEmpty ? (
          <div className="mx-auto mt-14 max-w-2xl text-center">
            <div className="relative overflow-hidden rounded-xl border border-stone bg-eggshell px-8 py-12 shadow-[var(--shadow-whisper)] sm:px-12">
              <div
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-1 bg-foreground"
              />
              <span className="mx-auto inline-flex size-12 items-center justify-center rounded-full border border-stone bg-warm-taupe text-graphite">
                <Lightbulb className="size-6" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-xl font-medium text-foreground">
                We’re designing the best deal for your team.
              </h3>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-smoke">
                Plans are still being thoughtfully shaped. In the meantime,{' '}
                {isLoggedIn ? (
                  'your workspace remains fully functional.'
                ) : (
                  <>
                    <Link
                      to="/auth"
                      className="font-semibold text-foreground underline decoration-stone underline-offset-2 hover:no-underline"
                    >
                      create a free workspace
                    </Link>{' '}
                    and start tracking today. No card required.
                  </>
                )}
              </p>
            </div>
          </div>
        ) : (
          /* ── Cards ── */
          <div className="mx-auto mt-14 grid max-w-4xl gap-5 lg:grid-cols-2">
            {others.map((plan) => (
              <PlanCard
                key={plan.slug}
                plan={plan}
                isLoggedIn={isLoggedIn}
                highlighted={false}
              />
            ))}
            {recommended && (
              <PlanCard
                key={recommended.slug}
                plan={recommended}
                isLoggedIn={isLoggedIn}
                highlighted={true}
              />
            )}
          </div>
        )}

        {/* ── Caption ── */}
        <p className="mx-auto mt-6 max-w-xl text-center text-xs leading-5 text-smoke">
          {isEmpty
            ? "Pricing will be announced soon. No surprises — we'll share details before anything changes."
            : 'Prices shown in USD, billed monthly. Cancel anytime — your data stays accessible for 90 days.'}
        </p>
      </div>
    </section>
  )
}

function PlanCard({
  plan,
  isLoggedIn,
  highlighted,
}: {
  plan: LandingPricingPlan
  isLoggedIn: boolean
  highlighted: boolean
}) {
  return (
    <article
      className={`relative flex flex-col overflow-hidden rounded-xl border transition-shadow ${
        highlighted
          ? 'border-ink/20 bg-eggshell shadow-[var(--shadow-whisper)]'
          : 'border-stone bg-eggshell shadow-[var(--shadow-whisper)]'
      }`}
    >
      {highlighted && (
        <div className="flex items-center justify-center gap-1.5 bg-primary-action py-2 text-center text-xs font-bold uppercase tracking-[0.12em] text-primary-action-foreground">
          <Sparkles className="size-3" aria-hidden="true" />
          Best value for growing teams
        </div>
      )}

      <div className="flex flex-1 flex-col p-6 lg:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-graphite">
          {highlighted ? 'Most complete' : 'Monthly workspace plan'}
        </p>
        <h3 className="mt-2 font-display text-2xl text-foreground">
          {plan.name}
        </h3>
        <p className="mt-2 min-h-[2.5rem] text-sm leading-6 text-smoke">
          {plan.tagline}
        </p>

        <div className="mt-6 flex items-baseline gap-1.5 text-foreground">
          <span className="font-display text-4xl">${plan.price}</span>
          <span className="text-sm font-semibold text-smoke">/ month</span>
        </div>

        <ul className="mt-7 flex flex-1 flex-col gap-3 p-0">
          {plan.features.map((feature) => {
            const isCatchAll = feature.startsWith('Everything in ')
            return (
              <li
                key={feature}
                className={`flex gap-3 text-sm ${
                  isCatchAll
                    ? 'font-semibold text-foreground'
                    : 'text-foreground/80'
                }`}
              >
                <Check
                  className={`mt-0.5 size-4 shrink-0 ${
                    isCatchAll ? 'text-foreground' : 'text-smoke'
                  }`}
                  aria-hidden="true"
                />
                {feature}
              </li>
            )
          })}
        </ul>

        <Link
          to={isLoggedIn ? '/app/workspace/billing' : '/auth'}
          search={{ plan: plan.slug } as Record<string, string>}
          className={`mt-8 inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-6 text-sm font-bold no-underline transition-colors ${
            highlighted
              ? 'border-stone bg-primary-action text-primary-action-foreground hover:bg-primary-action/85'
              : 'border-stone bg-eggshell text-foreground hover:bg-warm-taupe'
          }`}
        >
          {highlighted ? 'Get started' : 'Choose'} {plan.name}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </article>
  )
}
