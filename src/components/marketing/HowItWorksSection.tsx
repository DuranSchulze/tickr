import { Play, Sparkles, UserPlus } from 'lucide-react'
import { WORKFLOW_STEPS } from '#/lib/landing-content'

const icons = { 'user-plus': UserPlus, play: Play, sparkles: Sparkles }

export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="landing-section scroll-mt-24 border-b border-border bg-background"
    >
      <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10 lg:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">
            How it works
          </p>
          <h2 className="mt-4 text-balance font-heading text-4xl font-black tracking-[-0.04em] text-foreground sm:text-5xl">
            From first click to useful report.
          </h2>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">
            A simple rhythm your team can learn in minutes.
          </p>
        </div>

        <ol className="relative mt-14 grid gap-5 p-0 md:grid-cols-3">
          <div
            aria-hidden="true"
            className="absolute left-[16.67%] right-[16.67%] top-8 hidden border-t border-dashed border-primary/35 md:block"
          />
          {WORKFLOW_STEPS.map((step) => {
            const Icon = icons[step.icon]
            return (
              <li
                key={step.number}
                className="relative border border-border bg-card p-6"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="relative z-10 flex size-16 items-center justify-center border border-primary/30 bg-background text-primary shadow-[4px_4px_0_color-mix(in_oklab,var(--primary)_12%,transparent)]">
                    <Icon className="size-6" aria-hidden="true" />
                  </span>
                  <span className="font-mono text-sm font-bold text-primary">
                    {step.number}
                  </span>
                </div>
                <h3 className="mt-7 text-xl font-black tracking-tight text-foreground">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {step.body}
                </p>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
