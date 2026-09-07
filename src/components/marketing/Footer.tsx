import { Link } from '@tanstack/react-router'
import { AppLogo } from '#/components/ui/AppLogo'
import { BRAND } from '#/lib/brand'

const productLinks = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
  { href: '/api/docs', label: 'API docs' },
]

export function Footer({ isLoggedIn }: { isLoggedIn: boolean }) {
  return (
    <footer className="border-t border-border bg-muted/25">
      <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:px-10">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_0.6fr_0.6fr]">
          <div className="max-w-sm">
            <Link to="/" className="inline-flex items-center no-underline">
              <AppLogo size="md" />
            </Link>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              A calm, connected workspace for tracking team time and turning it
              into useful context.
            </p>
          </div>
          <nav aria-label="Product links">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-foreground">
              Product
            </p>
            <ul className="mt-4 grid gap-3 p-0 text-sm text-muted-foreground">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="no-underline transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Account links">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-foreground">
              Account
            </p>
            <ul className="mt-4 grid gap-3 p-0 text-sm text-muted-foreground">
              <li>
                <Link
                  to="/auth"
                  className="no-underline transition-colors hover:text-foreground"
                >
                  Sign in
                </Link>
              </li>
              <li>
                <Link
                  to={isLoggedIn ? '/app/time-tracker' : '/auth'}
                  className="no-underline transition-colors hover:text-foreground"
                >
                  {isLoggedIn ? 'Open workspace' : 'Create workspace'}
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
          </p>
          <p>Legal and social links will be added when published.</p>
        </div>
      </div>
    </footer>
  )
}
