import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, Check, Loader2, Mail } from 'lucide-react'

type Status = 'idle' | 'loading' | 'success' | 'already_subscribed' | 'error'

export function NewsletterSection({ contactEmail }: { contactEmail?: string }) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return

    setStatus('loading')
    setErrorMessage('')

    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })

      const data = (await res.json()) as {
        success?: boolean
        alreadySubscribed?: boolean
        error?: string
      }

      if (!res.ok || data.error) {
        setErrorMessage(data.error ?? 'Something went wrong.')
        setStatus('error')
        return
      }

      if (data.alreadySubscribed) {
        setStatus('already_subscribed')
      } else {
        setStatus('success')
      }
    } catch {
      setErrorMessage('Network error. Please try again.')
      setStatus('error')
    }
  }

  function reset() {
    setEmail('')
    setStatus('idle')
    setErrorMessage('')
  }

  return (
    <section className="landing-section border-b border-border bg-background">
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10 lg:py-20">
        <div className="mx-auto max-w-xl text-center">
          {/* Header */}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3.5 py-1 text-xs font-bold uppercase tracking-[0.14em] text-primary">
            <Mail className="size-3" aria-hidden="true" />
            Stay in the loop
          </span>
          <h2 className="mt-5 text-balance font-heading text-3xl font-black tracking-[-0.04em] text-foreground sm:text-4xl">
            Get updates from Trackly.
          </h2>
          <p className="mt-3 text-base leading-7 text-muted-foreground">
            Product updates, early access, and tips for your team — straight to
            your inbox. No spam, unsubscribe anytime.
          </p>

          {/* Form */}
          {status === 'success' || status === 'already_subscribed' ? (
            <div className="mt-8 flex flex-col items-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 px-6 py-8">
              <span className="inline-flex size-10 items-center justify-center rounded-full bg-primary/15">
                <Check className="size-5 text-primary" aria-hidden="true" />
              </span>
              <p className="text-sm font-bold text-foreground">
                {status === 'already_subscribed'
                  ? "You're already on the list!"
                  : "You're in! Thanks for subscribing."}
              </p>
              <button
                type="button"
                onClick={reset}
                className="mt-1 text-xs font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Add a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8">
              <div className="flex flex-col gap-3 sm:flex-row">
                <label htmlFor="newsletter-email" className="sr-only">
                  Email address
                </label>
                <input
                  id="newsletter-email"
                  type="email"
                  required
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={status === 'loading'}
                  className="min-h-12 flex-1 rounded-xl border border-border bg-card px-4 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/10 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground shadow-sm shadow-primary/20 transition-all hover:brightness-110 disabled:opacity-50"
                >
                  {status === 'loading' ? (
                    <>
                      <Loader2
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                      Subscribing…
                    </>
                  ) : (
                    <>
                      Subscribe
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </>
                  )}
                </button>
              </div>

              {status === 'error' && (
                <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                  {errorMessage}
                </p>
              )}
            </form>
          )}

          {/* Contact link */}
          {contactEmail && (
            <p className="mt-6 text-sm text-muted-foreground">
              Prefer to talk?{' '}
              <a
                href={`mailto:${contactEmail}`}
                className="font-semibold text-primary underline underline-offset-2 hover:no-underline"
              >
                Contact our team
              </a>
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
