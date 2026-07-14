import { Link } from '@tanstack/react-router'
import { ArrowRight, Check, Pause, Play, Sparkles } from 'lucide-react'
import { HERO } from '#/lib/landing-content'
import { BRAND } from '#/lib/brand'

export function HeroSection({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <section className="relative isolate overflow-hidden border-b border-border/70">
      <div
        aria-hidden="true"
        className="landing-orb absolute -left-40 top-8 -z-10 size-[34rem] rounded-full bg-primary/16 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="landing-orb absolute -right-48 top-40 -z-10 size-[30rem] rounded-full bg-primary/10 blur-3xl [animation-delay:-3s]"
      />
      <div aria-hidden="true" className="landing-grid absolute inset-0 -z-20" />

      <div className="mx-auto grid min-h-[calc(100svh-65px)] max-w-7xl items-center gap-12 px-5 py-14 sm:px-8 lg:grid-cols-[1.04fr_0.96fr] lg:px-10 lg:py-20">
        <div className="max-w-3xl">
          <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-primary/25 bg-primary/8 px-3 text-xs font-bold uppercase tracking-[0.16em] text-primary">
            <Sparkles className="size-3.5" aria-hidden="true" />
            {HERO.eyebrow}
          </span>
          <h1 className="mt-6 max-w-3xl text-balance font-heading text-5xl font-black leading-[0.98] tracking-[-0.05em] text-foreground sm:text-6xl lg:text-7xl">
            Time tracking your team will{' '}
            <span className="text-primary">actually use.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-muted-foreground sm:text-xl">
            {HERO.subhead}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to={isLoggedIn ? '/app/time-tracker' : '/auth'}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground no-underline shadow-lg shadow-primary/20 transition-transform hover:-translate-y-0.5"
            >
              {isLoggedIn ? 'Open your workspace' : HERO.primaryCta}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-background/75 px-6 text-sm font-bold text-foreground no-underline backdrop-blur transition-colors hover:bg-muted"
            >
              {HERO.secondaryCta}
            </a>
          </div>
          <ul
            className="mt-7 flex flex-wrap gap-x-5 gap-y-2 p-0 text-sm text-muted-foreground"
            aria-label="Product benefits"
          >
            {[
              'Fast setup',
              'No credit card to create an account',
              'Export-ready reports',
            ].map((benefit) => (
              <li key={benefit} className="flex items-center gap-2">
                <Check className="size-4 text-primary" aria-hidden="true" />
                {benefit}
              </li>
            ))}
          </ul>
        </div>

        <TimerPreview />
      </div>
    </section>
  )
}

function TimerPreview() {
  return (
    <div className="relative mx-auto w-full max-w-xl lg:mx-0">
      <div
        aria-hidden="true"
        className="absolute -inset-5 -z-10 rounded-[2rem] bg-primary/12 blur-2xl"
      />
      <div className="overflow-hidden rounded-[1.75rem] border border-border/80 bg-card/95 p-3 shadow-2xl shadow-foreground/10 backdrop-blur sm:p-4">
        <div className="flex items-center justify-between px-2 pb-3 text-xs font-semibold text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-primary shadow-[0_0_0_5px_color-mix(in_oklab,var(--primary)_15%,transparent)]" />
            Workspace overview
          </span>
          <span>Today</span>
        </div>

        <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl bg-foreground p-6 text-background dark:bg-muted dark:text-foreground">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-60">
                  Active timer
                </p>
                <p className="mt-3 text-base font-bold">Landing page refresh</p>
                <p className="mt-1 text-sm opacity-65">
                  {BRAND.name} · Product design
                </p>
              </div>
              <button
                type="button"
                aria-label="Pause preview timer"
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
              >
                <Pause className="size-4" aria-hidden="true" />
              </button>
            </div>
            <p className="mt-10 font-mono text-4xl font-black tabular-nums sm:text-5xl">
              01:24:07
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
              {['design', 'billable', 'website'].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-current/15 px-2.5 py-1 opacity-70"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
            <PreviewMetric label="Tracked today" value="31h 42m" />
            <PreviewMetric label="Team active" value="8 / 12" />
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-border/70 bg-background/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-foreground">
                Recent activity
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Clean context, ready to report
              </p>
            </div>
            <Play className="size-4 text-primary" aria-hidden="true" />
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-[72%] rounded-full bg-primary" />
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-black tracking-tight text-foreground">
        {value}
      </p>
    </div>
  )
}
