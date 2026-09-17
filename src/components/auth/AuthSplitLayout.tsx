import { Link } from '@tanstack/react-router'
import { BarChart3, Clock, Users } from 'lucide-react'
import { ThemeToggle } from '#/components/ui/theme-toggle'
import { BrandLogo } from '#/components/ui/BrandLogo'
import { DevLoginButton } from '#/components/auth/DevLoginButton'
import { BRAND } from '#/lib/brand'

export function AuthSplitLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen bg-eggshell text-foreground">
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="grid min-h-screen lg:grid-cols-2">
        {/* ── Left: background image + tagline ─────────────────────────── */}
        <aside className="relative hidden overflow-hidden border-r border-stone bg-eggshell lg:block">
          <img
            src="/auth-background.jpg"
            alt=""
            className="absolute inset-0 size-full object-cover opacity-10 grayscale"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-eggshell via-eggshell/90 to-warm-taupe" />

          <div className="relative flex h-full flex-col justify-between p-10 text-foreground">
            <Link
              to="/"
              className="inline-flex w-fit items-center gap-3 no-underline"
            >
              <BrandLogo className="size-10 rounded-full border border-stone bg-eggshell object-contain" />
              <span className="text-sm font-bold tracking-wide text-foreground">
                {BRAND.name}
              </span>
            </Link>

            <div className="max-w-lg">
              <p className="m-0 text-xs font-bold uppercase tracking-[0.2em] text-smoke">
                Internal time tracking
              </p>
              <h2 className="m-0 mt-3 font-display text-heading text-foreground sm:text-5xl">
                Track every hour, every project,
                <br />
                every team.
              </h2>
              <p className="m-0 mt-4 text-base leading-7 text-smoke">
                A private workspace for live timers, manual entries, and clean
                reporting. Built for teams who care about their time.
              </p>

              <ul className="m-0 mt-8 grid gap-3 p-0 text-sm">
                <Benefit icon={Clock} label="One active timer per member" />
                <Benefit icon={Users} label="Departments, projects and tags" />
                <Benefit icon={BarChart3} label="Day, week, and month totals" />
              </ul>
            </div>

            <p className="m-0 text-xs text-smoke">
              © {new Date().getFullYear()} {BRAND.name} (internal workspace).
            </p>
          </div>
        </aside>

        {/* ── Right: content (form card) ────────────────────────────────── */}
        <section className="flex items-center justify-center px-4 py-12 sm:px-8">
          <div className="max-h-[calc(100vh-6rem)] w-full max-w-[440px] overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Link
              to="/"
              className="inline-flex items-center gap-3 no-underline lg:hidden"
            >
              <BrandLogo className="size-9 rounded-full border border-stone bg-eggshell object-contain" />
              <span className="text-sm font-bold text-foreground">
                {BRAND.name}
              </span>
            </Link>
            {children}
          </div>
        </section>
      </div>

      <DevLoginButton />
    </main>
  )
}

function Benefit({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex size-8 items-center justify-center rounded-full bg-warm-taupe">
        <Icon className="size-4 text-graphite" />
      </span>
      <span className="text-graphite">{label}</span>
    </li>
  )
}
