import { Link } from '@tanstack/react-router'
import { ArrowRight, Check } from 'lucide-react'
import { PLAN_PREVIEWS } from '#/lib/landing-content'

export function PricingPreview({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <section
      id="pricing"
      className="landing-section scroll-mt-24 border-b border-border bg-background"
    >
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-primary">
            Monthly plans
          </span>
          <h2 className="mt-5 text-balance font-heading text-4xl font-black tracking-[-0.04em] text-foreground sm:text-5xl">
            Straightforward pricing for focused teams.
          </h2>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            Choose the workspace tools your team needs today, with room to add
            more structure when your operation grows.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl gap-5 lg:grid-cols-2">
          {PLAN_PREVIEWS.map((plan) => (
            <article
              key={plan.name}
              className={`relative flex flex-col border p-6 ${plan.featured ? 'border-primary bg-primary/[0.045] shadow-[7px_7px_0_color-mix(in_oklab,var(--primary)_18%,transparent)]' : 'border-border bg-card'}`}
            >
              {plan.featured ? (
                <span className="absolute right-0 top-0 border-b border-l border-primary bg-primary px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-primary-foreground">
                  Most complete
                </span>
              ) : null}
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
                Monthly workspace plan
              </p>
              <h3 className="mt-3 text-2xl font-black tracking-tight text-foreground">
                {plan.name}
              </h3>
              <p className="mt-3 min-h-12 text-sm leading-6 text-muted-foreground">
                {plan.tagline}
              </p>
              <p
                className="mt-7 flex items-end gap-2 text-foreground"
                aria-label={`$${plan.price} per month`}
              >
                <span className="text-4xl font-black tracking-[-0.04em]">
                  ${plan.price}
                </span>
                <span className="pb-1 text-sm font-semibold text-muted-foreground">
                  / month
                </span>
              </p>
              <ul className="mt-7 grid flex-1 gap-3 p-0 text-sm text-foreground">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-3">
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                to={isLoggedIn ? '/app/time-tracker' : '/auth'}
                className={`mt-8 inline-flex min-h-11 items-center justify-center gap-2 border px-5 text-sm font-bold no-underline ${plan.featured ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-foreground hover:bg-muted'}`}
              >
                {isLoggedIn ? 'Open workspace' : `Choose ${plan.name}`}{' '}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
        <p className="mx-auto mt-7 max-w-2xl text-center text-xs leading-5 text-muted-foreground">
          Prices are shown in USD and billed monthly.
        </p>
      </div>
    </section>
  )
}
