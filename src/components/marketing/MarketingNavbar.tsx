import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Sparkles, User } from 'lucide-react'
import { BRAND } from '#/lib/brand'
import { ThemeToggle } from '#/components/ui/theme-toggle'
import { AppLogo } from '#/components/ui/AppLogo'

interface MarketingNavbarProps {
  session?: { user?: { name?: string; email: string } } | null
}

export function MarketingNavbar({ session }: MarketingNavbarProps) {
  const isLoggedIn = !!session?.user

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="flex items-center gap-3 no-underline">
          <AppLogo size="md" />
          <div>
            <p className="m-0 text-sm font-black uppercase tracking-[0.2em] text-foreground">
              {BRAND.name}
            </p>
            <p className="m-0 text-xs text-muted-foreground">
              Team time, made visible
            </p>
          </div>
        </Link>

        <nav className="hidden items-center gap-2 rounded-lg border border-border/70 bg-card/80 p-1 md:flex">
          <NavLink href="#features">Features</NavLink>
          <NavLink href="#how-it-works">How it works</NavLink>
          <NavLink href="#insights">Insights</NavLink>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {isLoggedIn ? (
            <>
              <Link
                to="/app/profile"
                className="hidden items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground no-underline transition-colors hover:bg-muted sm:inline-flex"
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                title={session?.user?.email}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
                  <User className="h-3.5 w-3.5" />
                </div>
                <span className="max-w-[120px] truncate">
                  {
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                    session?.user?.name || session?.user?.email
                  }
                </span>
              </Link>
              <Link
                to="/app/time-tracker"
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-bold text-[var(--primary-foreground)] no-underline shadow-lg shadow-[var(--primary)]/20 transition-all hover:-translate-y-0.5 hover:brightness-110"
              >
                Open tracker
                <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          ) : (
            <>
              <Link
                to="/auth"
                className="hidden rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground no-underline transition-colors hover:bg-muted sm:inline-flex"
              >
                Sign in
              </Link>
              <Link
                to="/app/time-tracker"
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-bold text-[var(--primary-foreground)] no-underline shadow-lg shadow-[var(--primary)]/20 transition-all hover:-translate-y-0.5 hover:brightness-110"
              >
                Open app
                <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-muted-foreground no-underline transition-colors hover:bg-muted hover:text-foreground"
    >
      <Sparkles className="h-3.5 w-3.5 text-[var(--primary)]" />
      {children}
    </a>
  )
}
