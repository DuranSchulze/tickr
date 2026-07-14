import {
  BarChart3,
  Download,
  Layers3,
  ShieldCheck,
  TimerReset,
  Users,
} from 'lucide-react'
import { FEATURES } from '#/lib/landing-content'

const icons = {
  timer: TimerReset,
  layers: Layers3,
  users: Users,
  chart: BarChart3,
  shield: ShieldCheck,
  export: Download,
}

export function FeaturesSection() {
  return (
    <section
      id="features"
      className="landing-section scroll-mt-24 border-b border-border bg-muted/25"
    >
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
        <div className="grid gap-6 lg:grid-cols-[0.7fr_1fr] lg:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">
              Everything in context
            </p>
            <h2 className="mt-4 text-balance font-heading text-4xl font-black tracking-[-0.04em] text-foreground sm:text-5xl">
              Small tools. One clear system.
            </h2>
          </div>
          <p className="max-w-2xl text-lg leading-8 text-muted-foreground lg:justify-self-end">
            Trackly keeps the daily action simple, then quietly organizes the
            details your team needs for reporting and decisions.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, index) => {
            const Icon = icons[feature.icon]
            return (
              <article
                key={feature.title}
                className="group rounded-2xl border border-border bg-card p-6 shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="text-xs font-bold text-muted-foreground/60">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-7 text-lg font-black tracking-tight text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {feature.body}
                </p>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
