import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import CurvedLoop from '#/components/CurvedLoop'

export function CtaBand({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <section className="landing-section bg-background">
      {/* ── Curved marquee — animated text ribbon above the CTA ── */}
      <CurvedLoop
        marqueeText="Your next clear workday • "
        speed={1.2}
        curveAmount={120}
        direction="left"
        interactive={true}
        height="clamp(18rem, 32vw, 31rem)"
        className="border-y border-border bg-muted/25 py-3 sm:py-6"
        textClassName="text-[3rem] sm:text-[4.5rem] lg:text-[6.5rem] font-mono font-black uppercase tracking-tight text-primary/10 dark:text-primary/15"
      />

      {/* ── CTA ── */}
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:pb-28">
        <div className="flex flex-col items-center gap-10 text-center lg:flex-row lg:text-left">
          <div className="flex-1 space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">
              Start in under a minute
            </p>
            <h2 className="text-balance font-heading text-4xl font-black tracking-[-0.04em] text-foreground sm:text-5xl">
              Make every hour easier to understand.
            </h2>
          </div>

          <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
            <Link
              to={isLoggedIn ? '/app/time-tracker' : '/auth'}
              className="inline-flex min-h-12 items-center justify-center gap-2 border border-primary bg-primary px-7 text-sm font-bold text-primary-foreground no-underline shadow-[4px_4px_0_color-mix(in_oklab,var(--primary)_22%,transparent)] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
            >
              {isLoggedIn ? 'Open your workspace' : 'Create your workspace'}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <a
              href="#features"
              className="inline-flex min-h-12 items-center justify-center border border-border bg-card px-7 text-sm font-bold text-foreground no-underline transition-colors hover:border-primary/50 hover:bg-muted"
            >
              See what's inside
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
