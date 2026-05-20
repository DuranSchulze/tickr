import type { ComponentType } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowRight,
  BarChart3,
  Clock,
  Gauge,
  Pause,
  Play,
  ShieldCheck,
  Sparkles,
  Tags,
  Users,
  Workflow,
} from 'lucide-react'
import { MarketingNavbar } from '#/components/marketing/MarketingNavbar'
import { BRAND } from '#/lib/brand'
import { getSessionFn } from '#/lib/server/session'

export const Route = createFileRoute('/')({
  loader: async () => {
    const session = await getSessionFn()
    return { session }
  },
  component: HomePage,
})

function HomePage() {
  const { session } = Route.useLoaderData()
  return (
    <main className="min-h-screen bg-background text-foreground">
      <MarketingNavbar session={session} />

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Decorative gradient blobs */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-60 dark:opacity-40"
        >
          <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-[var(--primary)] blur-3xl opacity-30" />
          <div className="absolute right-0 top-40 h-80 w-80 rounded-full bg-[var(--primary)] blur-3xl opacity-20" />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,color-mix(in_oklab,var(--border)_45%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--border)_45%,transparent)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]"
        />

        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-lg border border-[var(--primary)]/30 bg-[var(--primary)]/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--primary)]">
              <Sparkles className="h-3 w-3" />
              Internal time tracking
            </span>
            <h1 className="m-0 mt-5 max-w-3xl text-5xl font-black leading-[1.05] tracking-tight text-foreground sm:text-6xl">
              Track every hour,
              <br />
              <span className="bg-gradient-to-r from-[var(--primary)] to-[var(--primary)]/60 bg-clip-text text-transparent">
                across every team.
              </span>
            </h1>
            <p className="m-0 mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
              A private company workspace for live timers, manual entries,
              controlled catalogs, and clean reporting — built for teams who
              care about their time.
            </p>
            <div className="mt-6 grid max-w-2xl gap-3 sm:grid-cols-3">
              <HeroStat value="1" label="Active timer per member" />
              <HeroStat value="24/7" label="Clear visibility across teams" />
              <HeroStat value="Day to month" label="Reporting built in" />
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/app/time-tracker"
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-5 py-3 text-sm font-bold text-[var(--primary-foreground)] no-underline shadow-lg shadow-[var(--primary)]/20 transition-all hover:brightness-110 hover:shadow-xl"
              >
                Start tracking
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-3 text-sm font-bold text-foreground no-underline transition-colors hover:bg-muted"
              >
                See how it works
              </a>
            </div>
          </div>

          <TimerPreview />
        </div>
      </section>

      <section id="insights" className="border-t border-border bg-background">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-16 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="border border-border bg-card p-8 shadow-sm">
            <p className="m-0 text-sm font-bold uppercase tracking-[0.24em] text-[var(--primary)]">
              Visibility
            </p>
            <h2 className="m-0 mt-3 max-w-lg text-3xl font-black tracking-tight text-foreground sm:text-4xl">
              A calmer workspace for everyone tracking time.
            </h2>
            <p className="m-0 mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              Managers get a cleaner overview, while teammates stay focused on
              the one thing they need right now: what is running, what got done,
              and where the hours are going next.
            </p>
            <div className="mt-8 grid gap-3">
              <InsightRow
                icon={Gauge}
                title="Fast scan dashboard"
                body="Important signals stay visible above the fold instead of getting buried in tables."
              />
              <InsightRow
                icon={ShieldCheck}
                title="Safer workspace defaults"
                body="Roles, catalogs, and reporting stay controlled without making the interface feel heavy."
              />
              <InsightRow
                icon={Users}
                title="Made for teams, not just solo timers"
                body="The layout reads like a shared operational tool instead of a personal stopwatch."
              />
            </div>
          </div>

          <div className="relative overflow-hidden border border-border bg-gradient-to-br from-card via-card to-muted/50 p-8 shadow-sm">
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_top,color-mix(in_oklab,var(--primary)_28%,transparent),transparent_70%)]"
            />
            <div className="relative">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="m-0 text-xs font-bold uppercase tracking-[0.24em] text-[var(--primary)]">
                    Workspace pulse
                  </p>
                  <h3 className="m-0 mt-2 text-2xl font-black text-foreground">
                    Today at a glance
                  </h3>
                </div>
                <span className="border border-border bg-background/80 px-3 py-1 text-xs font-semibold text-muted-foreground">
                  Live snapshot
                </span>
              </div>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <MetricCard value="08:14" label="Average focus block" />
                <MetricCard value="14" label="Entries submitted" />
                <MetricCard value="3" label="Teams active now" />
              </div>

              <div className="mt-6 border border-border bg-background/85 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="m-0 text-sm font-bold text-foreground">
                      Design System Sprint
                    </p>
                    <p className="m-0 mt-1 text-xs uppercase tracking-[0.22em] text-muted-foreground">
                      Product team
                    </p>
                  </div>
                  <span className="border border-primary/20 bg-[var(--primary)]/10 px-3 py-1 text-xs font-bold text-[var(--primary)]">
                    On track
                  </span>
                </div>
                <div className="mt-5 h-3 overflow-hidden bg-muted">
                  <div className="h-full w-[72%] bg-[linear-gradient(90deg,var(--primary),color-mix(in_oklab,var(--primary)_50%,white))]" />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <MiniMetric label="Tracked today" value="31h 42m" />
                  <MiniMetric label="Billable share" value="68%" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────── */}
      <section id="features" className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="max-w-2xl">
            <p className="m-0 text-sm font-bold uppercase tracking-wider text-[var(--primary)]">
              Features
            </p>
            <h2 className="m-0 mt-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
              Everything your team needs to track work.
            </h2>
            <p className="m-0 mt-3 text-base text-muted-foreground">
              From solo freelancers to full departments — the same simple timer
              powers your whole workspace.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Feature
              icon={Clock}
              title="One active timer"
              body="Members can only have a single timer running — no double-counting, no confusion."
            />
            <Feature
              icon={Tags}
              title="Projects and tags"
              body="Organise time by project, tag billable work, and categorise entries your way."
            />
            <Feature
              icon={Users}
              title="Teams and cohorts"
              body="Group members by department or cohort for reporting and management."
            />
            <Feature
              icon={BarChart3}
              title="Rich reporting"
              body="Day, week, and month totals. Filter by member, project, or tag."
            />
            <Feature
              icon={ShieldCheck}
              title="Role-based access"
              body="Owner, Admin, Manager, Employee — everyone sees only what they should."
            />
            <Feature
              icon={Workflow}
              title="Controlled catalogs"
              body="Owners decide which projects, tags, and departments are available."
            />
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────── */}
      <section id="how-it-works" className="bg-background">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="max-w-2xl">
            <p className="m-0 text-sm font-bold uppercase tracking-wider text-[var(--primary)]">
              How it works
            </p>
            <h2 className="m-0 mt-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
              Three steps to get started.
            </h2>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            <Step
              num={1}
              title="Add your team"
              body="Invite members, assign roles, and organise them into departments."
            />
            <Step
              num={2}
              title="Track time"
              body="Start a timer on any project, add tags, and log manual entries."
            />
            <Step
              num={3}
              title="Review reports"
              body="Slice totals by day, week, or month to see where time goes."
            />
          </div>
        </div>
      </section>

      {/* ── CTA band ────────────────────────────────────────────────── */}
      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="relative overflow-hidden border border-border bg-gradient-to-br from-[var(--primary)] to-[var(--primary)]/80 p-10 shadow-xl sm:p-14">
            <div className="relative z-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
              <div>
                <h2 className="m-0 max-w-2xl text-3xl font-black tracking-tight text-[var(--primary-foreground)] sm:text-4xl">
                  Ready to track your team's time?
                </h2>
                <p className="m-0 mt-3 text-base leading-7 text-[var(--primary-foreground)]/80">
                  Open the app and start the first timer in seconds.
                </p>
              </div>
              <Link
                to="/app/time-tracker"
                className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-card px-6 py-3 text-sm font-bold text-card-foreground no-underline shadow-lg transition-transform hover:scale-105"
              >
                Open app
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div
              aria-hidden
              className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[var(--primary-foreground)]/10 blur-3xl"
            />
            <div
              aria-hidden
              className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-[var(--primary-foreground)]/10 blur-3xl"
            />
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="bg-background">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row">
          <p className="m-0">
            © {new Date().getFullYear()} {BRAND.name} — internal workspace.
          </p>
          <div className="flex items-center gap-4">
            <Link
              to="/auth"
              className="no-underline transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
            <Link
              to="/app/time-tracker"
              className="no-underline transition-colors hover:text-foreground"
            >
              Open app
            </Link>
          </div>
        </div>
      </footer>
    </main>
  )
}

function Feature({
  icon: Icon,
  title,
  body,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  body: string
}) {
  return (
    <div className="group border border-border bg-card p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-border/80 hover:shadow-lg">
      <div className="inline-flex h-10 w-10 items-center justify-center border border-primary/20 bg-[var(--primary)]/10 text-[var(--primary)] transition-colors group-hover:bg-[var(--primary)]/20">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="m-0 mt-4 text-base font-bold text-card-foreground">
        {title}
      </h3>
      <p className="m-0 mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  )
}

function Step({
  num,
  title,
  body,
}: {
  num: number
  title: string
  body: string
}) {
  return (
    <div className="relative border border-border bg-card p-6 shadow-sm">
      <div className="flex h-12 w-12 items-center justify-center bg-[var(--primary)] text-lg font-black text-[var(--primary-foreground)] shadow-lg shadow-[var(--primary)]/20">
        {num}
      </div>
      <h3 className="m-0 mt-5 text-lg font-bold text-foreground">{title}</h3>
      <p className="m-0 mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  )
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="border border-border bg-card/80 px-4 py-3 shadow-sm">
      <p className="m-0 text-lg font-black text-foreground">{value}</p>
      <p className="m-0 mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
    </div>
  )
}

function InsightRow({
  icon: Icon,
  title,
  body,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  body: string
}) {
  return (
    <div className="flex gap-4 border border-border bg-background/70 p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-primary/20 bg-[var(--primary)]/10 text-[var(--primary)]">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="m-0 text-sm font-bold text-foreground">{title}</p>
        <p className="m-0 mt-1 text-sm leading-6 text-muted-foreground">
          {body}
        </p>
      </div>
    </div>
  )
}

function MetricCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="border border-border bg-background/75 p-4 shadow-sm">
      <p className="m-0 text-2xl font-black text-foreground">{value}</p>
      <p className="m-0 mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border bg-card px-4 py-3">
      <p className="m-0 text-xs uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <p className="m-0 mt-1 text-base font-black text-foreground">{value}</p>
    </div>
  )
}

function TimerPreview() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:mx-0">
      <div
        aria-hidden
        className="absolute -inset-4 bg-gradient-to-br from-[var(--primary)]/30 to-transparent blur-2xl"
      />
      <div className="relative rotate-1 border border-border bg-card p-6 shadow-2xl transition-transform hover:rotate-0">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--primary)] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--primary)]" />
            </span>
            Active timer
          </span>
          <span>Today</span>
        </div>

        <p className="m-0 mt-4 text-sm font-bold text-card-foreground">
          Dashboard redesign
        </p>
        <p className="m-0 text-xs text-muted-foreground">
          {BRAND.name} · Frontend
        </p>

        <div className="mt-5 flex items-end justify-between">
          <div>
            <p className="m-0 font-mono text-4xl font-black tabular-nums text-card-foreground">
              01:24:07
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <TagPill label="design" />
              <TagPill label="billable" />
              <TagPill label="q1" />
            </div>
          </div>
          <button
            type="button"
            aria-label="Stop timer"
            className="flex h-12 w-12 items-center justify-center border border-primary/20 bg-[var(--primary)] text-[var(--primary-foreground)] shadow-lg shadow-[var(--primary)]/30 transition-transform hover:scale-110"
          >
            <Pause className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 border-t border-border/60 pt-4">
          <p className="m-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent
          </p>
          <ul className="m-0 mt-2 grid gap-1 p-0 text-sm">
            <RecentRow
              icon={Play}
              title="Client review call"
              duration="45:12"
            />
            <RecentRow icon={Play} title="Inbox sweep" duration="22:40" />
          </ul>
        </div>
      </div>
    </div>
  )
}

function TagPill({ label }: { label: string }) {
  return (
    <span className="border border-border bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
      #{label}
    </span>
  )
}

function RecentRow({
  icon: Icon,
  title,
  duration,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  duration: string
}) {
  return (
    <li className="flex items-center justify-between gap-3 border border-transparent px-2 py-1.5 text-foreground/90">
      <span className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-[var(--primary)]" />
        {title}
      </span>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {duration}
      </span>
    </li>
  )
}
