import { Activity, Gauge, ShieldCheck, Users } from 'lucide-react'

export function WorkspacePreviewSection() {
  return (
    <section className="landing-section border-b border-stone bg-eggshell">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-20 sm:px-8 lg:grid-cols-[0.82fr_1.18fr] lg:px-10 lg:py-24">
        <div className="flex flex-col justify-center">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-graphite">
            Clarity without clutter
          </p>
          <h2 className="mt-4 text-balance font-display text-heading text-foreground sm:text-5xl">
            A calmer way to run the workday.
          </h2>
          <p className="mt-5 max-w-xl text-lg leading-8 text-smoke">
            Teammates see what matters now. Managers get the context they need
            later. Everyone works from the same clean record.
          </p>
          <div className="mt-8 grid gap-3">
            <ValueRow
              icon={Gauge}
              title="Scan the day quickly"
              body="Current activity and important signals stay easy to find."
            />
            <ValueRow
              icon={ShieldCheck}
              title="Keep access intentional"
              body="Roles and controlled catalogs protect workspace structure."
            />
            <ValueRow
              icon={Users}
              title="Built around teams"
              body="Shared visibility goes beyond a personal stopwatch."
            />
          </div>
        </div>

        <div className="rounded-3xl bg-warm-taupe p-3 sm:p-5">
          <div className="rounded-xl bg-eggshell p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-graphite">
                  Workspace pulse
                </p>
                <h3 className="mt-2 font-display text-2xl text-foreground">
                  Today at a glance
                </h3>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-stone bg-eggshell px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-smoke">
                <Activity
                  className="size-3.5 text-graphite"
                  aria-hidden="true"
                />{' '}
                Live preview
              </span>
            </div>
            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <Metric value="08:14" label="Average focus" />
              <Metric value="14" label="Entries logged" />
              <Metric value="3" label="Teams active" />
            </div>
            <div className="mt-4 rounded-xl border border-stone bg-eggshell p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-foreground">Website launch</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.16em] text-smoke">
                    Product team
                  </p>
                </div>
                <span className="rounded-full border border-stone bg-warm-taupe px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-graphite">
                  On track
                </span>
              </div>
              <div className="mt-6 h-2 overflow-hidden rounded-full border border-stone bg-warm-taupe">
                <div className="h-full w-[72%] rounded-full bg-primary-action" />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <span className="text-smoke">
                  Billable share{' '}
                  <strong className="mt-1 block text-lg font-medium text-foreground">
                    68%
                  </strong>
                </span>
                <span className="text-smoke">
                  Tracked{' '}
                  <strong className="mt-1 block text-lg font-medium text-foreground">
                    31h 42m
                  </strong>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function ValueRow({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Gauge
  title: string
  body: string
}) {
  return (
    <div className="flex gap-4 rounded-xl bg-warm-taupe p-4 transition-colors hover:bg-stone">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-eggshell text-graphite">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div>
        <h3 className="font-medium text-foreground">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-smoke">{body}</p>
      </div>
    </div>
  )
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-warm-taupe p-4">
      <p className="font-display text-2xl text-foreground">{value}</p>
      <p className="mt-1 text-xs text-smoke">{label}</p>
    </div>
  )
}
