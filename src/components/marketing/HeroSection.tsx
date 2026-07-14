import { lazy, Suspense } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  CircleDollarSign,
  Pencil,
  Play,
  Sparkles,
  Square,
  Tag,
} from 'lucide-react'
import { HERO } from '#/lib/landing-content'
import { BRAND } from '#/lib/brand'

const PixelBlast = lazy(() => import('#/components/PixelBlast'))

export function HeroSection({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <section className="relative isolate overflow-hidden border-b border-border/70">
      <div aria-hidden="true" className="absolute inset-0 -z-20">
        <Suspense fallback={null}>
          <PixelBlast
            className="pixel-blast-container--hero"
            variant="square"
            pixelSize={4}
            patternScale={3}
            patternDensity={0.72}
            pixelSizeJitter={0.2}
            enableRipples={false}
            edgeFade={0.22}
            speed={0.22}
            transparent
          />
        </Suspense>
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-gradient-to-b from-background/35 via-background/62 to-background"
      />
      <div
        aria-hidden="true"
        className="absolute inset-y-0 left-0 -z-10 w-3/5 bg-gradient-to-r from-background via-background/80 to-transparent"
      />

      <div className="relative z-10 mx-auto grid min-h-[calc(100svh-65px)] max-w-7xl items-center gap-12 px-5 py-14 sm:px-8 lg:grid-cols-[0.92fr_1.08fr] lg:px-10 lg:py-20 xl:grid-cols-[0.84fr_1.16fr]">
        <div className="max-w-3xl">
          <span className="inline-flex min-h-8 items-center gap-2 border border-primary/40 bg-primary/10 px-3 text-xs font-bold uppercase tracking-[0.16em] text-primary">
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
              className="inline-flex min-h-12 items-center justify-center gap-2 border border-primary bg-primary px-6 text-sm font-bold text-primary-foreground no-underline shadow-[4px_4px_0_color-mix(in_oklab,var(--primary)_24%,transparent)] transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
            >
              {isLoggedIn ? 'Open your workspace' : HERO.primaryCta}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex min-h-12 items-center justify-center border border-border bg-background/85 px-6 text-sm font-bold text-foreground no-underline transition-colors hover:border-primary/50 hover:bg-muted"
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
    <figure
      aria-label="Preview of the Trackly timer input and running entry"
      className="relative mx-auto w-full max-w-2xl lg:mx-0"
    >
      <div
        aria-hidden="true"
        className="absolute -inset-3 -z-10 translate-x-3 translate-y-3 border border-primary/15 bg-primary/8"
      />
      <div
        aria-hidden="true"
        className="overflow-hidden border border-border bg-background/95 p-3 shadow-[8px_8px_0_color-mix(in_oklab,var(--foreground)_8%,transparent)] sm:p-4"
      >
        <div className="flex items-center justify-between gap-4 px-1 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-40" />
              <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
            </span>
            <div>
              <p className="text-xs font-bold text-foreground">Time tracker</p>
              <p className="text-[0.65rem] text-muted-foreground">
                {BRAND.name} product preview
              </p>
            </div>
          </div>
          <span className="border border-border bg-card px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Today · 3h 42m
          </span>
        </div>

        <div className="border border-border bg-card p-3">
          <div className="flex min-w-0 gap-2 max-sm:flex-col">
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-11 min-w-0 flex-1 items-stretch overflow-hidden border border-primary/60 bg-background shadow-[3px_3px_0_color-mix(in_oklab,var(--primary)_14%,transparent)] sm:h-12">
                  <div className="flex min-w-0 flex-[1.15] items-center px-3">
                    <span className="truncate text-sm font-semibold text-foreground">
                      Landing page refresh
                    </span>
                  </div>

                  <div className="my-2.5 hidden w-px bg-border sm:block" />
                  <div className="hidden min-w-0 flex-1 items-center gap-2 px-3 sm:flex">
                    <span className="size-2 shrink-0 rounded-full bg-violet-500" />
                    <span className="truncate text-xs font-medium text-foreground">
                      Website · Design
                    </span>
                    <ChevronDown className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                  </div>

                  <div className="my-2.5 hidden w-px bg-border md:block" />
                  <div className="hidden items-center gap-1 px-2 md:flex">
                    <Tag className="size-4 text-primary" />
                    <CircleDollarSign className="size-4 text-amber-500" />
                    <Bookmark className="size-4 text-muted-foreground" />
                  </div>
                </div>

                <span className="hidden h-12 min-w-[5.75rem] items-center justify-center gap-2 border border-destructive bg-destructive px-4 text-sm font-bold text-destructive-foreground sm:inline-flex">
                  <Square className="size-3.5 fill-current" />
                  Stop
                </span>
              </div>

              <div className="border border-primary/40 bg-primary/10 p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-primary">
                    Running now
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="border border-destructive/40 px-2 py-1 text-[0.65rem] font-bold text-destructive">
                      Discard
                    </span>
                    <span className="inline-flex items-center gap-1 border border-destructive bg-destructive px-2 py-1 text-[0.65rem] font-bold text-destructive-foreground sm:hidden">
                      <Square className="size-2.5 fill-current" /> Stop
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex items-end justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-foreground sm:text-base">
                      Landing page refresh
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.65rem] text-muted-foreground sm:text-xs">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-violet-500" />
                        Website
                      </span>
                      <span className="border border-amber-400/40 bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        Billable
                      </span>
                      <span className="border border-primary/30 bg-primary/5 px-1.5 py-0.5 font-medium text-primary">
                        design
                      </span>
                    </div>
                    <p className="mt-2 text-[0.65rem] text-muted-foreground sm:text-xs">
                      Started at{' '}
                      <strong className="text-foreground">09:18 AM</strong>{' '}
                      <Pencil className="inline size-2.5" />
                    </p>
                  </div>
                  <p className="shrink-0 font-mono text-xl font-black tabular-nums tracking-tight text-foreground sm:text-2xl">
                    01:24:07
                  </p>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-center gap-1 border-border/60 max-sm:border-t max-sm:pt-2 sm:flex-col sm:border-l sm:pl-2">
              <span className="grid size-8 place-items-center border border-primary/25 bg-primary/10 text-primary">
                <Play className="size-4" />
              </span>
              <span className="grid size-8 place-items-center border border-transparent text-muted-foreground">
                <Pencil className="size-4" />
              </span>
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <ProductSignal value="1 active" label="timer" />
          <ProductSignal value="3h 42m" label="tracked" />
          <ProductSignal value="8 people" label="online" />
        </div>
      </div>
      <figcaption className="sr-only">
        Trackly’s time-entry bar with project, tags, billable status, timer
        mode, and an active running entry.
      </figcaption>
    </figure>
  )
}

function ProductSignal({ value, label }: { value: string; label: string }) {
  return (
    <div className="border border-border bg-card/70 px-3 py-2.5 text-center">
      <p className="text-xs font-black text-foreground">{value}</p>
      <p className="mt-0.5 text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
    </div>
  )
}
