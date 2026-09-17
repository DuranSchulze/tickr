import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import CurvedLoop from '#/components/CurvedLoop'

export function CtaBand({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <section className="landing-section bg-eggshell">
      {/* ── Curved marquee — animated text ribbon above the CTA ── */}
      <CurvedLoop
        marqueeText="Your next clear workday • "
        speed={1.2}
        curveAmount={120}
        direction="left"
        interactive={true}
        height="clamp(18rem, 32vw, 31rem)"
        className="border-y border-stone bg-warm-taupe py-3 sm:py-6"
        textClassName="text-[3rem] sm:text-[4.5rem] lg:text-[6.5rem] font-display uppercase tracking-tight text-foreground/10"
      />

      {/* ── CTA ── */}
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:pb-28">
        <div className="flex flex-col items-center gap-10 text-center lg:flex-row lg:text-left">
          <div className="flex-1 space-y-4">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-graphite">
              Start in under a minute
            </p>
            <h2 className="text-balance font-display text-heading text-foreground sm:text-5xl">
              Make every hour easier to understand.
            </h2>
          </div>

          <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
            <Link
              to={isLoggedIn ? '/app/time-tracker' : '/auth'}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary-action px-7 text-sm font-bold text-primary-action-foreground no-underline shadow-[var(--shadow-whisper)] transition-colors hover:bg-primary-action/85"
            >
              {isLoggedIn ? 'Open your workspace' : 'Create your workspace'}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <a
              href="#features"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-stone bg-eggshell px-7 text-sm font-bold text-foreground no-underline transition-colors hover:bg-warm-taupe"
            >
              See what's inside
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
