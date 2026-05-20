import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react'
import { authClient } from '#/lib/auth-client'
import { AuthSplitLayout } from '#/components/auth/AuthSplitLayout'

export const Route = createFileRoute('/auth/forgot-password')({
  component: ForgotPasswordPage,
})

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
        <div className="mt-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h1 className="m-0 mt-5 text-3xl font-black tracking-tight">
            Check your inbox
          </h1>
          <p className="m-0 mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            If an account exists for <strong>{email}</strong>, we've sent a link
            to reset your password. The link expires in 15 minutes.
          </p>
          <p className="m-0 mt-2 text-xs text-slate-500 dark:text-slate-400">
            Didn't see it? Check your spam folder, or{' '}
            <button
              type="button"
              onClick={() => setSubmitted(false)}
              className="font-semibold text-[var(--primary)] underline-offset-2 hover:underline"
            >
              try a different email
            </button>
            .
          </p>

          <Link
            to="/auth"
            className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-slate-700 no-underline hover:text-slate-950 dark:text-slate-300 dark:hover:text-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>
        </div>
      ) : (
        <div className="mt-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
            <Mail className="h-6 w-6" />
          </div>
          <h1 className="m-0 mt-5 text-3xl font-black tracking-tight">
            Forgot your password?
          </h1>
          <p className="m-0 mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Enter the email you use for Tickr and we'll send you a link to reset
            it.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
            <label className="grid gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition-colors focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 h-11 rounded-lg bg-[var(--primary)] text-sm font-bold text-[var(--primary-foreground)] shadow-sm transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>

          <Link
            to="/auth"
            className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-700 no-underline hover:text-slate-950 dark:text-slate-300 dark:hover:text-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sign in
          </Link>
        </div>
      )}
    </AuthSplitLayout>
  )
}
