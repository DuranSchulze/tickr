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

  useEffect(() => {
    if (!menuOpen) return

    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
        <Link
          to="/"
          className="flex items-center gap-3 no-underline"
          aria-label={`${BRAND.name} home`}
        >
          <AppLogo size="md" customSrc="/logo.svg" imgClassName="dark:invert" />
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
              className="inline-flex min-h-10 items-center border-x border-transparent px-3.5 text-sm font-semibold text-muted-foreground no-underline transition-colors hover:border-border hover:bg-muted hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle className="size-10 rounded-none" />
          {!isLoggedIn && (
            <Link
              to="/auth"
              className="hidden min-h-10 items-center px-3 text-sm font-bold text-foreground no-underline lg:inline-flex"
            >
              Sign in
            </Link>
          )}
          <Link
            to={isLoggedIn ? '/app/time-tracker' : '/auth'}
            className={`hidden min-h-10 items-center gap-2 border border-primary bg-primary px-4 text-sm font-bold text-primary-foreground no-underline transition-all lg:inline-flex ${pastHeroIntro ? 'shadow-[3px_3px_0_color-mix(in_oklab,var(--primary)_22%,transparent)]' : ''}`}
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
            className="flex size-10 items-center justify-center border border-border bg-card text-foreground lg:hidden"
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
          className="absolute inset-x-0 top-full z-50 flex h-[calc(100dvh-4rem)] overflow-y-auto bg-background lg:hidden"
        >
          <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6 sm:px-8 sm:pt-10">
            <div className="border-t border-border">
              {navLinks.map((link, index) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="group flex min-h-16 items-center justify-between border-b border-border px-1 font-heading text-2xl font-black text-foreground no-underline transition-colors hover:bg-muted sm:min-h-20 sm:text-3xl"
                >
                  <span>{link.label}</span>
                  <span
                    className="font-sans text-xs font-bold tabular-nums text-muted-foreground"
                    aria-hidden="true"
                  >
                    0{index + 1}
                  </span>
                </a>
              ))}
            </div>

            <div className="mt-auto grid gap-3 pt-8 sm:grid-cols-2">
              {!isLoggedIn && (
                <Link
                  to="/auth"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex min-h-12 items-center justify-center border border-border bg-card px-4 text-sm font-bold text-foreground no-underline transition-colors hover:bg-muted"
                >
                  Sign in
                </Link>
              )}
              <Link
                to={isLoggedIn ? '/app/time-tracker' : '/auth'}
                onClick={() => setMenuOpen(false)}
                className={`inline-flex min-h-12 items-center justify-center gap-2 border border-primary bg-primary px-4 text-sm font-bold text-primary-foreground no-underline ${isLoggedIn ? 'sm:col-span-2' : ''}`}
              >
                {isLoggedIn ? 'Open dashboard' : 'Create workspace'}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </nav>
      ) : null}
    </header>
  )
}
