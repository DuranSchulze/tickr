import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { AlertTriangle, CheckCircle2, KeyRound } from 'lucide-react'
import { gooeyToast } from 'goey-toast'
import { authClient } from '#/lib/auth-client'
import { AuthSplitLayout } from '#/components/auth/AuthSplitLayout'
import { PasswordInput } from '#/components/ui/password-input'
import { PasswordStrengthChecklist } from '#/components/auth/PasswordStrengthChecklist'
import { allPasswordRulesPass } from '#/lib/auth-validation'

type ResetPasswordSearch = {
  token?: string
  error?: string
}

export const Route = createFileRoute('/auth/reset-password')({
  validateSearch: (search: Record<string, unknown>): ResetPasswordSearch => ({
    token: typeof search.token === 'string' ? search.token : undefined,
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const { token, error: searchError } = Route.useSearch()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const invalidLink = !token || Boolean(searchError)

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (!token) return
    setFormError(null)

    if (!allPasswordRulesPass(password)) {
      setFormError(
        'Please ensure your password meets all the requirements below.',
      )
      return
    }
    if (password !== confirm) {
      setFormError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      })
      if (result.error) {
        setFormError(
          result.error.message ??
            'This reset link is invalid or has expired. Please request a new one.',
        )
        return
      }
      setSuccess(true)
      gooeyToast.success('Password updated')
    } catch {
      setFormError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Invalid / expired link state ──────────────────────────────────────────
  if (invalidLink) {
    return (
      <AuthSplitLayout>
        <div className="mt-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="m-0 mt-5 text-3xl font-black tracking-tight">
            Link expired or invalid
          </h1>
          <p className="m-0 mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            This password reset link is no longer valid. Reset links expire 15
            minutes after they're sent and can only be used once.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/auth/forgot-password"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-[var(--primary)] px-5 text-sm font-bold text-[var(--primary-foreground)] no-underline shadow-sm transition-all hover:brightness-110"
            >
              Request a new link
            </Link>
            <Link
              to="/auth"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-800 no-underline transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </AuthSplitLayout>
    )
  }

  // ── Success state ─────────────────────────────────────────────────────────
  if (success) {
    return (
      <AuthSplitLayout>
        <div className="mt-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h1 className="m-0 mt-5 text-3xl font-black tracking-tight">
            Password updated
          </h1>
          <p className="m-0 mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Your password has been changed. You can now sign in with your new
            password.
          </p>

          <button
            type="button"
            onClick={() => void navigate({ to: '/auth' })}
            className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-[var(--primary)] px-5 text-sm font-bold text-[var(--primary-foreground)] shadow-sm transition-all hover:brightness-110"
          >
            Sign in
          </button>
        </div>
      </AuthSplitLayout>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <AuthSplitLayout>
      <div className="mt-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">
          <KeyRound className="h-6 w-6" />
        </div>
        <h1 className="m-0 mt-5 text-3xl font-black tracking-tight">
          Set a new password
        </h1>
        <p className="m-0 mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
          Choose a strong password you haven't used before.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4">
          <div className="grid gap-2">
            <label
              htmlFor="reset-password-new"
              className="text-sm font-semibold text-slate-700 dark:text-slate-300"
            >
              New password
            </label>
            <PasswordInput
              id="reset-password-new"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
            <PasswordStrengthChecklist password={password} />
          </div>

          <div className="grid gap-2">
            <label
              htmlFor="reset-password-confirm"
              className="text-sm font-semibold text-slate-700 dark:text-slate-300"
            >
              Confirm password
            </label>
            <PasswordInput
              id="reset-password-confirm"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          {formError && (
            <p
              role="alert"
              className="m-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-950 dark:bg-red-950/50 dark:text-red-300"
            >
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !allPasswordRulesPass(password)}
            className="mt-2 h-11 rounded-lg bg-[var(--primary)] text-sm font-bold text-[var(--primary-foreground)] shadow-sm transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </AuthSplitLayout>
  )
}
