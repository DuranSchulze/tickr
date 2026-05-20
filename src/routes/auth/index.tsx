import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useState } from 'react'
import { BarChart3, Clock, Users } from 'lucide-react'
import { authClient } from '#/lib/auth-client'
import { gooeyToast } from 'goey-toast'
import { ThemeToggle } from '#/components/ui/theme-toggle'
import { BRAND } from '#/lib/brand'
import { PasswordInput } from '#/components/ui/password-input'
import { DevLoginButton } from '#/components/auth/DevLoginButton'
import { PasswordStrengthChecklist } from '#/components/auth/PasswordStrengthChecklist'
import { cn } from '#/lib/utils'
import { allPasswordRulesPass, isBlockedDomain } from '#/lib/auth-validation'
import { getSessionFn } from '#/lib/server/session'
import { getWorkspaceAccessFn } from '#/lib/server/workspace-access'

type AuthSearch = { invite?: string; email?: string }

export const Route = createFileRoute('/auth/')({
  validateSearch: (search: Record<string, unknown>): AuthSearch => ({
    invite: typeof search.invite === 'string' ? search.invite : undefined,
    email: typeof search.email === 'string' ? search.email : undefined,
  }),
  loaderDeps: ({ search }) => ({ invite: search.invite }),
  loader: async ({ deps }) => {
    const session = await getSessionFn()
    if (session?.user) {
      if (deps.invite) {
        throw redirect({
          to: '/invite/$token',
          params: { token: deps.invite },
        })
      }
      let hasWorkspaceAccess = false
      try {
        await getWorkspaceAccessFn()
        hasWorkspaceAccess = true
      } catch {
        hasWorkspaceAccess = false
      }

      if (hasWorkspaceAccess) {
        throw redirect({ to: '/app/time-tracker' })
      }

      return {
        signedIn: true as const,
        email: session.user.email,
        name: session.user.name,
      }
    }

    return {
      signedIn: false as const,
      email: '',
      name: '',
    }
  },
  component: AuthPage,
})

function AuthPage() {
  const { signedIn, email, name } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const router = useRouter()
  const [mode, setMode] = useState<'signin' | 'signup'>(
    search.invite ? 'signup' : 'signin',
  )
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState(search.email ?? '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [nameError, setNameError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [confirmPasswordError, setConfirmPasswordError] = useState('')
  const [serverError, setServerError] = useState('')

  function validateName(value: string) {
    if (value.trim().length < 2) {
      setNameError('Name must be at least 2 characters.')
    } else {
      setNameError('')
    }
  }

  function validateEmail(value: string) {
    if (mode === 'signup' && isBlockedDomain(value)) {
      setEmailError(
        'Please use your company or work email. Personal email providers are not permitted.',
      )
    } else {
      setEmailError('')
    }
  }

  function validateConfirmPassword(value: string) {
    if (mode !== 'signup') {
      setConfirmPasswordError('')
      return
    }
    if (!value) {
      setConfirmPasswordError('Please confirm your password.')
    } else if (value !== password) {
      setConfirmPasswordError('Passwords do not match.')
    } else {
      setConfirmPasswordError('')
    }
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setServerError('')

    if (mode === 'signup') {
      if (nameError || emailError) return
      if (isBlockedDomain(formEmail)) {
        setEmailError(
          'Please use your company or work email. Personal email providers are not permitted.',
        )
        return
      }
      if (!allPasswordRulesPass(password)) return
      if (!confirmPassword) {
        setConfirmPasswordError('Please confirm your password.')
        return
      }
      if (confirmPassword !== password) {
        setConfirmPasswordError('Passwords do not match.')
        return
      }
    }

    setLoading(true)

    try {
      const result =
        mode === 'signup'
          ? await authClient.signUp.email({
              name: formName,
              email: formEmail,
              password,
            })
          : await authClient.signIn.email({ email: formEmail, password })

      if (result.error) {
        if (mode === 'signup') {
          setServerError(
            result.error.message ??
              'Could not create account. Please try again.',
          )
        } else {
          gooeyToast.error('Sign in failed', {
            description: result.error.message ?? 'Authentication failed',
          })
        }
        return
      }

      if (search.invite) {
        await Promise.all([
          router.options.context.queryClient.invalidateQueries({
            queryKey: ['session'],
          }),
          router.options.context.queryClient.invalidateQueries({
            queryKey: ['workspace-access'],
          }),
          router.options.context.queryClient.invalidateQueries({
            queryKey: ['user-workspaces'],
          }),
        ])
        await router.invalidate()
        await navigate({
          to: '/invite/$token',
          params: { token: search.invite },
        })
      } else {
        await Promise.all([
          router.options.context.queryClient.invalidateQueries({
            queryKey: ['session'],
          }),
          router.options.context.queryClient.invalidateQueries({
            queryKey: ['workspace-access'],
          }),
          router.options.context.queryClient.invalidateQueries({
            queryKey: ['user-workspaces'],
          }),
        ])
        await router.invalidate()
        await navigate({ to: '/onboarding' })
      }
    } catch {
      gooeyToast.error('Something went wrong', {
        description: 'Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleSignOut(): Promise<void> {
    await authClient.signOut()
    await router.invalidate()
    await navigate({ to: '/auth' })
  }

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="grid min-h-screen lg:grid-cols-2">
        {/* ── Left: background image + tagline ─────────────────────────── */}
        <aside className="relative hidden overflow-hidden lg:block">
          <img
            src="/auth-background.jpg"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/40 to-black/80" />

          <div className="relative flex h-full flex-col justify-between p-10 text-white">
            <Link
              to="/"
              className="inline-flex w-fit items-center gap-3 no-underline"
            >
              <img
                src={BRAND.logoSrc}
                alt={BRAND.logoAlt}
                className="h-10 w-10 rounded-lg border border-white/20 bg-white/10 object-contain backdrop-blur"
              />
              <span className="text-sm font-bold tracking-wide text-white">
                {BRAND.name}
              </span>
            </Link>

            <div className="max-w-lg">
              <p className="m-0 text-xs font-bold uppercase tracking-[0.2em] text-white/70">
                Internal time tracking
              </p>
              <h2 className="m-0 mt-3 text-4xl font-black leading-tight tracking-tight sm:text-5xl">
                Track every hour, every project,
                <br />
                every team.
              </h2>
              <p className="m-0 mt-4 text-base leading-7 text-white/80">
                A private workspace for live timers, manual entries, and clean
                reporting. Built for teams who care about their time.
              </p>

              <ul className="m-0 mt-8 grid gap-3 p-0 text-sm">
                <Benefit icon={Clock} label="One active timer per member" />
                <Benefit icon={Users} label="Departments, projects and tags" />
                <Benefit icon={BarChart3} label="Day, week, and month totals" />
              </ul>
            </div>

            <p className="m-0 text-xs text-white/50">
              © {new Date().getFullYear()} {BRAND.name} — internal workspace.
            </p>
          </div>
        </aside>

        {/* ── Right: form card ─────────────────────────────────────────── */}
        <section className="flex items-center justify-center px-4 py-12 sm:px-8">
          <div className="max-h-[calc(100vh-6rem)] w-full max-w-[440px] overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Link
              to="/"
              className="inline-flex items-center gap-3 no-underline lg:hidden"
            >
              <img
                src={BRAND.logoSrc}
                alt={BRAND.logoAlt}
                className="h-9 w-9 rounded-lg border border-border bg-card object-contain"
              />
              <span className="text-sm font-bold text-foreground">
                {BRAND.name}
              </span>
            </Link>

            {signedIn ? (
              <SignedInPanel
                name={name}
                email={email}
                onSignOut={handleSignOut}
                onCheckAccess={() => void navigate({ to: '/onboarding' })}
              />
            ) : (
              <SignInForm
                mode={mode}
                name={formName}
                email={formEmail}
                password={password}
                confirmPassword={confirmPassword}
                loading={loading}
                nameError={nameError}
                emailError={emailError}
                confirmPasswordError={confirmPasswordError}
                serverError={serverError}
                onNameChange={(v) => {
                  setFormName(v)
                  if (nameError) setNameError('')
                }}
                onNameBlur={() => validateName(formName)}
                onEmailChange={(v) => {
                  setFormEmail(v)
                  if (emailError) setEmailError('')
                }}
                onEmailBlur={() => validateEmail(formEmail)}
                onPasswordChange={(v) => {
                  setPassword(v)
                  if (confirmPasswordError) setConfirmPasswordError('')
                }}
                onConfirmPasswordChange={(v) => {
                  setConfirmPassword(v)
                  if (confirmPasswordError) setConfirmPasswordError('')
                }}
                onConfirmPasswordBlur={() =>
                  validateConfirmPassword(confirmPassword)
                }
                onModeChange={(m) => {
                  setMode(m)
                  setNameError('')
                  setEmailError('')
                  setConfirmPassword('')
                  setConfirmPasswordError('')
                  setServerError('')
                }}
                onSubmit={handleSubmit}
              />
            )}
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
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 backdrop-blur">
        <Icon className="h-4 w-4 text-white" />
      </span>
      <span className="text-white/90">{label}</span>
    </li>
  )
}

function SignedInPanel({
  name,
  email,
  onSignOut,
  onCheckAccess,
}: {
  name: string
  email: string
  onSignOut: () => void
  onCheckAccess: () => void
}) {
  return (
    <div className="mt-8">
      <h1 className="m-0 text-2xl font-black tracking-tight">
        Already signed in
      </h1>
      <p className="m-0 mt-2 text-sm leading-6 text-muted-foreground">
        You are currently logged in to this device.
      </p>

      <div className="mt-5 rounded-lg border border-border bg-muted/40 p-4">
        <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Logged in as
        </p>
        <p className="m-0 mt-1 text-base font-bold text-foreground">{name}</p>
        <p className="m-0 text-sm text-muted-foreground">{email}</p>
      </div>

      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        This email is not yet linked to a workspace member. Ask an Owner or
        Admin to add it.
      </div>

      <div className="mt-5 grid gap-3">
        <button
          type="button"
          onClick={onCheckAccess}
          className="h-11 rounded-lg bg-primary text-sm font-bold text-primary-foreground transition-all hover:brightness-110"
        >
          Check workspace access
        </button>
        <button
          type="button"
          onClick={onSignOut}
          className="h-11 rounded-lg border border-border bg-card text-sm font-semibold text-foreground transition-colors hover:bg-muted"
        >
          Sign out and use another email
        </button>
      </div>
    </div>
  )
}

type AuthMode = 'signin' | 'signup'

function SignInForm({
  mode,
  name,
  email,
  password,
  confirmPassword,
  loading,
  nameError,
  emailError,
  confirmPasswordError,
  serverError,
  onNameChange,
  onNameBlur,
  onEmailChange,
  onEmailBlur,
  onPasswordChange,
  onConfirmPasswordChange,
  onConfirmPasswordBlur,
  onModeChange,
  onSubmit,
}: {
  mode: AuthMode
  name: string
  email: string
  password: string
  confirmPassword: string
  loading: boolean
  nameError: string
  emailError: string
  confirmPasswordError: string
  serverError: string
  onNameChange: (v: string) => void
  onNameBlur: () => void
  onEmailChange: (v: string) => void
  onEmailBlur: () => void
  onPasswordChange: (v: string) => void
  onConfirmPasswordChange: (v: string) => void
  onConfirmPasswordBlur: () => void
  onModeChange: (m: AuthMode) => void
  onSubmit: (e: React.FormEvent) => void
}) {
  const isSignup = mode === 'signup'
  const passwordValid = allPasswordRulesPass(password)
  const confirmPasswordValid =
    !isSignup || (confirmPassword.length > 0 && confirmPassword === password)
  const submitDisabled =
    loading ||
    (isSignup &&
      (!passwordValid ||
        !confirmPasswordValid ||
        !!emailError ||
        !!nameError ||
        !!confirmPasswordError))

  return (
    <div className="mt-8">
      <h1 className="m-0 text-3xl font-black tracking-tight">
        {isSignup ? 'Create your account' : 'Welcome back'}
      </h1>
      <p className="m-0 mt-2 text-sm leading-6 text-muted-foreground">
        {isSignup
          ? 'Sign up to access your workspace. Your Owner or Admin controls membership.'
          : 'Sign in to your workspace. Access is managed by your Owner or Admin.'}
      </p>

      {/* Segmented Sign in / Sign up tabs */}
      <div
        role="tablist"
        aria-label="Authentication mode"
        className="mt-6 grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/60 p-1"
      >
        <TabButton
          active={mode === 'signin'}
          onClick={() => onModeChange('signin')}
        >
          Sign in
        </TabButton>
        <TabButton
          active={mode === 'signup'}
          onClick={() => onModeChange('signup')}
        >
          Sign up
        </TabButton>
      </div>

      <form onSubmit={onSubmit} className="mt-6 grid gap-4">
        {isSignup && (
          <div className="grid gap-2">
            <label
              htmlFor="auth-name"
              className="text-sm font-semibold text-foreground/90"
            >
              Name
            </label>
            <input
              id="auth-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              onBlur={onNameBlur}
              aria-describedby={nameError ? 'name-error' : undefined}
              aria-invalid={!!nameError}
              className={cn(
                'h-11 rounded-lg border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/20',
                nameError
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-input focus:border-primary',
              )}
              required
            />
            {nameError && (
              <p id="name-error" className="text-xs text-red-500">
                {nameError}
              </p>
            )}
          </div>
        )}

        <div className="grid gap-2">
          <label
            htmlFor="auth-email"
            className="text-sm font-semibold text-foreground/90"
          >
            Email
          </label>
          <input
            id="auth-email"
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            onBlur={isSignup ? onEmailBlur : undefined}
            autoComplete="email"
            aria-describedby={emailError ? 'email-error' : undefined}
            aria-invalid={!!emailError}
            className={cn(
              'h-11 rounded-lg border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:ring-2 focus:ring-primary/20',
              emailError
                ? 'border-red-500 focus:border-red-500'
                : 'border-input focus:border-primary',
            )}
            required
          />
          {emailError && (
            <p id="email-error" className="text-xs text-red-500">
              {emailError}
            </p>
          )}
          {isSignup && !emailError && (
            <p className="text-xs text-muted-foreground">
              Use your company or work email address.
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between text-sm font-semibold text-foreground/90">
            <label htmlFor="auth-password">Password</label>
            {!isSignup && (
              <Link
                to="/auth/forgot-password"
                className="text-xs font-semibold text-[var(--primary)] no-underline hover:underline"
              >
                Forgot password?
              </Link>
            )}
          </div>
          <PasswordInput
            id="auth-password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
          />
          {isSignup && <PasswordStrengthChecklist password={password} />}
        </div>

        {isSignup && (
          <div className="grid gap-2">
            <label
              htmlFor="auth-confirm-password"
              className="text-sm font-semibold text-foreground/90"
            >
              Confirm password
            </label>
            <PasswordInput
              id="auth-confirm-password"
              value={confirmPassword}
              onChange={(event) => onConfirmPasswordChange(event.target.value)}
              onBlur={onConfirmPasswordBlur}
              autoComplete="new-password"
              aria-describedby={
                confirmPasswordError ? 'confirm-password-error' : undefined
              }
              aria-invalid={!!confirmPasswordError}
              className={cn(
                confirmPasswordError
                  ? 'border-red-500 focus:border-red-500'
                  : '',
              )}
              required
            />
            {confirmPasswordError && (
              <p id="confirm-password-error" className="text-xs text-red-500">
                {confirmPasswordError}
              </p>
            )}
          </div>
        )}

        {serverError && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          >
            {serverError}
          </div>
        )}

        <button
          type="submit"
          disabled={submitDisabled}
          className="mt-2 h-11 rounded-lg bg-[var(--primary)] text-sm font-bold text-[var(--primary-foreground)] shadow-sm transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'h-9 rounded-md text-sm font-semibold transition-colors',
        active
          ? 'bg-card text-card-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
