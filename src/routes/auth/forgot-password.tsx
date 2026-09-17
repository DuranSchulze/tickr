import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react'
import { authClient } from '#/lib/auth-client'
import { AuthSplitLayout } from '#/components/auth/AuthSplitLayout'

export const Route = createFileRoute('/auth/forgot-password')({
  component: ForgotPasswordPage,
})

// oxlint-disable-next-line react/only-export-components
function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setLoading(true)
    try {
      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}/auth/reset-password`
          : '/auth/reset-password'
      await authClient.requestPasswordReset({ email, redirectTo })
      // Always show the neutral confirmation regardless of outcome to avoid
      // leaking account existence.
      setSubmitted(true)
    } catch {
      // Network or unexpected failure — still show neutral confirmation.
      setSubmitted(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthSplitLayout>
      {submitted ? (
        <div className="mt-8 rounded-xl border border-stone bg-eggshell p-6 shadow-[var(--shadow-whisper)]">
          <div className="flex size-12 items-center justify-center rounded-full bg-warm-taupe text-graphite">
            <CheckCircle2 className="size-6" />
          </div>
          <h1 className="m-0 mt-5 font-display text-heading-sm text-foreground">
            Check your inbox
          </h1>
          <p className="m-0 mt-2 text-sm leading-6 text-smoke">
            If an account exists for <strong>{email}</strong>, we've sent a link
            to reset your password. The link expires in 15 minutes.
          </p>
          <p className="m-0 mt-2 text-xs text-smoke">
            Didn't see it? Check your spam folder, or{' '}
            <button
              type="button"
              onClick={() => setSubmitted(false)}
              className="font-semibold text-foreground underline-offset-2 hover:underline"
            >
              try a different email
            </button>
            .
          </p>

          <Link
            to="/auth"
            className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-foreground no-underline hover:text-graphite"
          >
            <ArrowLeft className="size-4" />
            Back to sign in
          </Link>
        </div>
      ) : (
        <div className="mt-8 rounded-xl border border-stone bg-eggshell p-6 shadow-[var(--shadow-whisper)]">
          <div className="flex size-12 items-center justify-center rounded-full bg-warm-taupe text-graphite">
            <Mail className="size-6" />
          </div>
          <h1 className="m-0 mt-5 font-display text-heading-sm text-foreground">
            Forgot your password?
          </h1>
          <p className="m-0 mt-2 text-sm leading-6 text-smoke">
            Enter the email you use for Trackly and we'll send you a link to
            reset it.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm font-semibold text-foreground">
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                className="h-11 rounded-md border border-input bg-eggshell px-3 text-sm text-foreground outline-none transition-colors focus:border-ink focus:ring-2 focus:ring-ink/20"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 h-11 rounded-full bg-primary-action text-sm font-bold text-primary-action-foreground shadow-[var(--shadow-whisper)] transition-colors hover:bg-primary-action/85 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>

          <Link
            to="/auth"
            className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-foreground no-underline hover:text-graphite"
          >
            <ArrowLeft className="size-4" />
            Back to sign in
          </Link>
        </div>
      )}
    </AuthSplitLayout>
  )
}
