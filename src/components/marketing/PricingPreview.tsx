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
          <span className="inline-flex rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-primary">
            Pricing preview
          </span>
          <h2 className="mt-5 text-balance font-heading text-4xl font-black tracking-[-0.04em] text-foreground sm:text-5xl">
            Start simple. Scale when you need to.
          </h2>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            Plan packaging is being finalized. Create your workspace now and
            explore the product while pricing is prepared.
          </p>
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {PLAN_PREVIEWS.map((plan) => (
            <article
              key={plan.name}
              className={`relative flex flex-col rounded-2xl border p-6 ${plan.featured ? 'border-primary bg-primary/[0.045] shadow-xl shadow-primary/10' : 'border-border bg-card shadow-sm'}`}
            >
              {plan.featured ? (
                <span className="absolute right-5 top-5 rounded-full bg-primary px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-primary-foreground">
                  Most flexible
                </span>
              ) : null}
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
                Coming soon
              </p>
              <h3 className="mt-3 text-2xl font-black tracking-tight text-foreground">
                {plan.name}
              </h3>
              <p className="mt-3 min-h-12 text-sm leading-6 text-muted-foreground">
                {plan.tagline}
              </p>
              <p className="mt-7 text-3xl font-black tracking-tight text-foreground">
                Pricing TBA
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
                className={`mt-8 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold no-underline ${plan.featured ? 'bg-primary text-primary-foreground' : 'border border-border bg-background text-foreground hover:bg-muted'}`}
              >
                {isLoggedIn ? 'Open workspace' : 'Create workspace'}{' '}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
