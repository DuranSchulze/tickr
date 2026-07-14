import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Menu, X } from 'lucide-react'
import { BRAND } from '#/lib/brand'
import { ThemeToggle } from '#/components/ui/theme-toggle'
import { AppLogo } from '#/components/ui/AppLogo'

interface MarketingNavbarProps {
  session?: { user?: { name?: string; email: string } } | null
}

const navLinks = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
]

export function MarketingNavbar({ session }: MarketingNavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [pastHeroIntro, setPastHeroIntro] = useState(false)
  const isLoggedIn = !!session?.user

  useEffect(() => {
    const update = () => setPastHeroIntro(window.scrollY > 240)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
        <Link
          to="/"
          className="flex items-center gap-3 no-underline"
          aria-label={`${BRAND.name} home`}
        >
          <AppLogo size="md" />
          <span className="font-heading text-sm font-black uppercase tracking-[0.18em] text-foreground">
            {BRAND.name}
          </span>
        </Link>

        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-1 lg:flex"
        >
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="inline-flex min-h-10 items-center rounded-lg px-3.5 text-sm font-semibold text-muted-foreground no-underline transition-colors hover:bg-muted hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle className="size-10" />
          {!isLoggedIn && (
            <Link
              to="/auth"
              className="hidden min-h-10 items-center px-3 text-sm font-bold text-foreground no-underline sm:inline-flex"
            >
              Sign in
            </Link>
          )}
          <Link
            to={isLoggedIn ? '/app/time-tracker' : '/auth'}
            className={`hidden min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground no-underline shadow-sm transition-all sm:inline-flex ${pastHeroIntro ? 'shadow-lg shadow-primary/20' : ''}`}
          >
            {isLoggedIn
              ? 'Dashboard'
              : pastHeroIntro
                ? 'Get started'
                : 'Create workspace'}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <button
            type="button"
            aria-label={
              menuOpen ? 'Close navigation menu' : 'Open navigation menu'
            }
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex size-10 items-center justify-center rounded-lg border border-border bg-card text-foreground lg:hidden"
          >
            {menuOpen ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <Menu className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <nav
          id="mobile-navigation"
          aria-label="Mobile navigation"
          className="border-t border-border bg-background px-5 py-4 lg:hidden"
        >
          <div className="mx-auto grid max-w-7xl gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="flex min-h-12 items-center rounded-lg px-3 text-sm font-bold text-foreground no-underline hover:bg-muted"
              >
                {link.label}
              </a>
            ))}
            <Link
              to={isLoggedIn ? '/app/time-tracker' : '/auth'}
              onClick={() => setMenuOpen(false)}
              className="mt-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground no-underline"
            >
              {isLoggedIn ? 'Open dashboard' : 'Create workspace'}{' '}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </nav>
      ) : null}
    </header>
  )
}
