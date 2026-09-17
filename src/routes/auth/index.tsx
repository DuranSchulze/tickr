import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useLayoutEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, BarChart3, Clock, Users } from 'lucide-react'
import { authClient } from '#/lib/auth-client'
import { gooeyToast } from '#/lib/toast'
import { ThemeToggle } from '#/components/ui/theme-toggle'
import { BrandLogo } from '#/components/ui/BrandLogo'
import { BRAND } from '#/lib/brand'
import { PasswordInput } from '#/components/ui/password-input'
import { DevLoginButton } from '#/components/auth/DevLoginButton'
import { PasswordStrengthChecklist } from '#/components/auth/PasswordStrengthChecklist'
import ColorBends from '#/components/ColorBends'
import { cn } from '#/lib/utils'
import { allPasswordRulesPass, isBlockedDomain } from '#/lib/auth-validation'
import { getSessionFn } from '#/lib/server/session'
import { getWorkspaceAccessFn } from '#/lib/server/workspace-access'

type AuthSearch = {
  invite?: string
  email?: string
  plan?: 'team' | 'business'
}

export const Route = createFileRoute('/auth/')({
  validateSearch: (search: Record<string, unknown>): AuthSearch => ({
    invite: typeof search.invite === 'string' ? search.invite : undefined,
    email: typeof search.email === 'string' ? search.email : undefined,
    plan:
      search.plan === 'team' || search.plan === 'business'
        ? search.plan
        : undefined,
  }),
  loaderDeps: ({ search }) => ({ invite: search.invite, plan: search.plan }),
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
        if (deps.plan) {
          throw redirect({
            to: '/app/workspace/billing',
            search: { plan: deps.plan },
          })
        }
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
  // Checked → persistent cookie (stays logged in across browser restarts for
  // the rolling session window). Unchecked → session cookie, cleared on close.
  const [rememberMe, setRememberMe] = useState(true)

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
          : await authClient.signIn.email({
              email: formEmail,
              password,
              rememberMe,
            })

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

      // Clear all stale data from the previous user session
      router.options.context.queryClient.clear()

      if (search.invite) {
        await router.invalidate()
        await navigate({
          to: '/invite/$token',
          params: { token: search.invite },
        })
      } else {
        await router.invalidate()
        await navigate({
          to: '/onboarding',
          search: { plan: search.plan },
        })
      }
    } catch {
      gooeyToast.error('Something went wrong', {
        description: 'Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }

  const queryClient = useQueryClient()

  async function handleSignOut(): Promise<void> {
    await authClient.signOut()
    queryClient.clear()
    await router.invalidate()
    await navigate({ to: '/auth' })
  }

  function handleBack(): void {
    // Prefer the previous page; fall back to the home page when there is no
    // history (e.g. the user landed directly on /auth).
    if (window.history.length > 1) {
      router.history.back()
    } else {
      void navigate({ to: '/' })
    }
  }

  return (
    <main className="relative min-h-screen bg-eggshell text-foreground">
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="grid min-h-screen lg:grid-cols-2">
        {/* ── Left: animated ColorBends canvas + tagline ───────────────── */}
        {/* The canvas is the base layer and the scrim sits over it, so the ink
            display type keeps the contrast it has on a plain eggshell canvas. */}
        <aside className="relative hidden overflow-hidden border-r border-stone bg-eggshell lg:block">
          <div aria-hidden="true" className="absolute inset-0 opacity-70">
            <ColorBends
              colors={['#000000', '#44403b', '#a59f97', '#0447ff']}
              rotation={24}
              speed={0.12}
              frequency={1.1}
              intensity={1.15}
              bandWidth={5}
              parallax={0.3}
              mouseInfluence={0.2}
              noise={0.02}
            />
          </div>
          {/* Two scrims: a vertical one that keeps the canvas visible at the
              top/bottom edges, and a horizontal one that solidifies behind the
              text column so the type keeps full contrast on any frame. */}
          <div className="absolute inset-0 bg-gradient-to-br from-eggshell/90 via-eggshell/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-eggshell via-eggshell/85 to-eggshell/45" />

          <div className="relative flex h-full flex-col justify-between p-10 text-foreground">
            {/* The panel is an eggshell canvas, so the wordmark renders as ink
                in light mode and warm off-white in dark mode. */}
            <Link to="/" className="inline-flex w-fit no-underline">
              <img
                src={BRAND.logoDarkSrc}
                alt={BRAND.logoAlt}
                className="h-16 w-auto object-contain brightness-0 dark:brightness-100"
              />
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

        {/* ── Right: form card ─────────────────────────────────────────── */}
        <section className="flex items-center justify-center px-4 py-12 sm:px-8">
          <div className="max-h-[calc(100vh-6rem)] w-full max-w-[440px] overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={handleBack}
              className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-smoke no-underline transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              Back
            </button>

            <Link
              to="/"
              className="inline-flex items-center no-underline lg:hidden"
            >
              <BrandLogo className="h-12 w-auto object-contain" />
            </Link>

            {signedIn ? (
              <SignedInPanel
                name={name}
                email={email}
                onSignOut={handleSignOut}
                onCheckAccess={() =>
                  void navigate({
                    to: '/onboarding',
                    search: { plan: search.plan },
                  })
                }
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
                rememberMe={rememberMe}
                onRememberMeChange={setRememberMe}
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
      <span className="flex size-8 items-center justify-center rounded-full bg-warm-taupe">
        <Icon className="size-4 text-graphite" />
      </span>
      <span className="text-graphite">{label}</span>
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
    <div className="mt-8 rounded-xl border border-stone bg-eggshell p-6 shadow-[var(--shadow-whisper)]">
      <h1 className="m-0 font-display text-2xl text-foreground">
        Already signed in
      </h1>
      <p className="m-0 mt-2 text-sm leading-6 text-smoke">
        You are currently logged in to this device.
      </p>

      <div className="mt-5 rounded-xl bg-warm-taupe p-4">
        <p className="m-0 text-xs font-semibold uppercase tracking-wide text-smoke">
          Logged in as
        </p>
        <p className="m-0 mt-1 text-base font-bold text-foreground">{name}</p>
        <p className="m-0 text-sm text-smoke">{email}</p>
      </div>

      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        This email is not yet linked to a workspace member. Ask an Owner or
        Admin to add it.
      </div>

      <div className="mt-5 grid gap-3">
        <button
          type="button"
          onClick={onCheckAccess}
          className="h-11 rounded-full bg-primary-action text-sm font-bold text-primary-action-foreground transition-colors hover:bg-primary-action/85"
        >
          Check workspace access
        </button>
        <button
          type="button"
          onClick={onSignOut}
          className="h-11 rounded-full border border-stone bg-eggshell text-sm font-semibold text-foreground transition-colors hover:bg-warm-taupe"
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
  rememberMe,
  onRememberMeChange,
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
  rememberMe: boolean
  onRememberMeChange: (v: boolean) => void
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

  // Sliding tab pill: CSS owns the tween, this only measures the active tab.
  // On first paint and resize the position is written without a transition so
  // the pill snaps into place instead of animating in from translateX(0).
  const tabsRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const bar = tabsRef.current
    const pill = bar?.querySelector<HTMLElement>('.t-tabs-pill')
    if (!bar || !pill) return

    const tabs = bar.querySelectorAll<HTMLElement>('.t-tab')
    const activeTab = (): HTMLElement | null =>
      Array.from(tabs).find(
        (t) => t.getAttribute('aria-selected') === 'true',
      ) ?? tabs.item(0)

    // Snap to the active tab without animating (first paint / resize). On a
    // mode change the effect re-runs and the same write *does* tween, because
    // by then the inline `transition: none` override has been released.
    const tab = activeTab()
    if (!tab) return
    const prevTransition = pill.style.transition
    pill.style.transition = 'none'
    pill.style.transform = `translateX(${tab.offsetLeft}px)`
    pill.style.width = `${tab.offsetWidth}px`
    pill.style.height = `${tab.offsetHeight}px`
    void pill.offsetWidth
    pill.style.transition = prevTransition
    if (!prevTransition) pill.style.removeProperty('transition')

    const onResize = () => {
      const next = activeTab()
      if (!next) return
      const prev = pill.style.transition
      pill.style.transition = 'none'
      pill.style.transform = `translateX(${next.offsetLeft}px)`
      pill.style.width = `${next.offsetWidth}px`
      pill.style.height = `${next.offsetHeight}px`
      void pill.offsetWidth
      pill.style.transition = prev
      if (!prev) pill.style.removeProperty('transition')
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [mode])

  return (
    <div className="mt-8 rounded-xl border border-stone bg-eggshell p-6 shadow-[var(--shadow-whisper)]">
      <h1 className="m-0 font-display text-heading-sm text-foreground">
        {isSignup ? 'Create your account' : 'Welcome back'}
      </h1>
      <p className="m-0 mt-2 text-sm leading-6 text-smoke">
        {isSignup
          ? 'Sign up to access your workspace. Your Owner or Admin controls membership.'
          : 'Sign in to your workspace. Access is managed by your Owner or Admin.'}
      </p>

      {/* Segmented Sign in / Sign up tabs — the active pill slides between
          them (transitions-dev "tabs sliding"); the form re-enters with a
          staggered cross-blur when the mode flips. */}
      <div
        role="tablist"
        aria-label="Authentication mode"
        ref={tabsRef}
        className="t-tabs mt-6 grid grid-cols-2 gap-1 rounded-full border border-stone bg-warm-taupe p-1"
      >
        <span className="t-tabs-pill" aria-hidden="true" />
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

      <form
        key={mode}
        onSubmit={onSubmit}
        className="t-stagger mt-6 grid gap-4"
        autoComplete="on"
      >
        {isSignup && (
          <div
            className="grid gap-2"
            style={{ '--stagger-i': 0 } as React.CSSProperties}
          >
            <label
              htmlFor="auth-name"
              className="text-sm font-semibold text-foreground/90"
            >
              Name
            </label>
            <input
              id="auth-name"
              name="name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              onBlur={onNameBlur}
              autoComplete="name"
              aria-describedby={nameError ? 'name-error' : undefined}
              aria-invalid={!!nameError}
              className={cn(
                'h-11 rounded-md border bg-eggshell px-3 text-sm text-foreground outline-none transition-colors focus:ring-2 focus:ring-ink/20',
                nameError
                  ? 'border-red-500 focus:border-red-500'
                  : 'border-stone focus:border-ink',
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

        <div
          className="grid gap-2"
          style={{ '--stagger-i': 1 } as React.CSSProperties}
        >
          <label
            htmlFor="auth-email"
            className="text-sm font-semibold text-foreground/90"
          >
            Email
          </label>
          <input
            id="auth-email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            onBlur={isSignup ? onEmailBlur : undefined}
            autoComplete={isSignup ? 'email' : 'username'}
            aria-describedby={emailError ? 'email-error' : undefined}
            aria-invalid={!!emailError}
            className={cn(
              'h-11 rounded-md border bg-eggshell px-3 text-sm text-foreground outline-none transition-colors focus:ring-2 focus:ring-ink/20',
              emailError
                ? 'border-red-500 focus:border-red-500'
                : 'border-stone focus:border-ink',
            )}
            required
          />
          {emailError && (
            <p id="email-error" className="text-xs text-red-500">
              {emailError}
            </p>
          )}
          {isSignup && !emailError && (
            <p className="text-xs text-smoke">
              Use your company or work email address.
            </p>
          )}
        </div>

        <div
          className="grid gap-2"
          style={{ '--stagger-i': 2 } as React.CSSProperties}
        >
          <div className="flex items-center justify-between text-sm font-semibold text-foreground/90">
            <label htmlFor="auth-password">Password</label>
            {!isSignup && (
              <Link
                to="/auth/forgot-password"
                className="text-xs font-semibold text-foreground no-underline hover:underline"
              >
                Forgot password?
              </Link>
            )}
          </div>
          <PasswordInput
            id="auth-password"
            name={isSignup ? 'new-password' : 'password'}
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
          />
          {isSignup && (
            <p className="text-xs text-smoke">
              Must be at least 8 characters with uppercase, lowercase, number,
              and special character.
            </p>
          )}
          {isSignup && <PasswordStrengthChecklist password={password} />}
        </div>

        {!isSignup && (
          <label
            className="flex items-center gap-2 text-sm text-foreground/90 select-none"
            style={{ '--stagger-i': 3 } as React.CSSProperties}
          >
            <input
              id="auth-remember-me"
              name="remember"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => onRememberMeChange(e.target.checked)}
              className="size-4 rounded border-stone accent-[var(--ink)]"
            />
            Remember me on this device
          </label>
        )}

        {isSignup && (
          <div
            className="grid gap-2"
            style={{ '--stagger-i': 4 } as React.CSSProperties}
          >
            <label
              htmlFor="auth-confirm-password"
              className="text-sm font-semibold text-foreground/90"
            >
              Confirm password
            </label>
            <PasswordInput
              id="auth-confirm-password"
              name="confirm-password"
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
            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          >
            {serverError}
          </div>
        )}

        <button
          type="submit"
          disabled={submitDisabled}
          className="mt-2 h-11 rounded-full bg-primary-action text-sm font-bold text-primary-action-foreground shadow-[var(--shadow-whisper)] transition-colors hover:bg-primary-action/85 disabled:cursor-not-allowed disabled:opacity-60"
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
      // `t-tab` is the hook the sliding pill measures (offsetLeft/offsetWidth)
      // and the transition target — it is required, not decorative.
      className={cn(
        't-tab h-9 rounded-full text-sm font-semibold transition-colors',
        active
          ? 'bg-eggshell text-foreground shadow-[var(--shadow-whisper)]'
          : 'text-smoke hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
