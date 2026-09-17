import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  Hash,
  Loader2,
  MailCheck,
  Sparkles,
  LogOut,
} from 'lucide-react'
import { BRAND } from '#/lib/brand'
import { gooeyToast } from '#/lib/toast'
import { authClient } from '#/lib/auth-client'
import { getSessionFn } from '#/lib/server/session'
import { listUserWorkspacesFn } from '#/lib/server/workspace-access'
import { createWorkspaceFn } from '#/lib/server/workspaces'
import { redeemInviteByCodeFn } from '#/lib/server/workspace-invites'
import { ThemeToggle } from '#/components/ui/theme-toggle'
import { TimezoneSelect } from '#/components/ui/TimezoneSelect'
import { BrandLogo } from '#/components/ui/BrandLogo'

type OnboardingSearch = { plan?: 'team' | 'business' }

export const Route = createFileRoute('/onboarding')({
  validateSearch: (search: Record<string, unknown>): OnboardingSearch => ({
    plan:
      search.plan === 'team' || search.plan === 'business'
        ? search.plan
        : undefined,
  }),
  loaderDeps: ({ search }) => ({ plan: search.plan }),
  loader: async ({ deps }) => {
    const session = await getSessionFn()
    if (!session?.user) {
      throw redirect({ to: '/auth' })
    }
    const workspaces = await listUserWorkspacesFn()
    if (workspaces.length > 0) {
      if (deps.plan) {
        throw redirect({
          to: '/app/workspace/billing',
          search: { plan: deps.plan },
        })
      }
      throw redirect({ to: '/app/time-tracker' })
    }
    return {
      email: session.user.email,
      name: session.user.name,
    }
  },
  component: OnboardingPage,
})

// oxlint-disable-next-line react/only-export-components
function OnboardingPage() {
  const { email, name } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'choose' | 'create'>('choose')
  const [wsName, setWsName] = useState('')
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Manila',
  )
  const [loading, setLoading] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joiningByCode, setJoiningByCode] = useState(false)

  const router = useRouter()

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (wsName.trim().length < 2) {
      gooeyToast.error('Name too short', {
        description: 'Workspace name must be at least 2 characters.',
      })
      return
    }
    setLoading(true)
    try {
      await createWorkspaceFn({
        data: {
          name: wsName.trim(),
          timezone,
          planSlug: search.plan,
        },
      })
      gooeyToast.success('Workspace created', {
        description: 'Welcome aboard!',
      })
      // Invalidate cached queries so the /app route picks up the new workspace
      await router.invalidate()
      if (search.plan) {
        await navigate({
          to: '/app/workspace/billing',
          search: { plan: search.plan },
        })
      } else {
        await navigate({ to: '/app/time-tracker' })
      }
    } catch (err) {
      // TanStack Router redirects (from route guards) are not real errors
      const isRedirect = err && typeof err === 'object' && 'code' in err
      if (!isRedirect) {
        gooeyToast.error('Could not create workspace', {
          description: err instanceof Error ? err.message : 'Please try again.',
        })
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleJoinByCode(e: React.FormEvent) {
    e.preventDefault()
    if (joinCode.trim().length < 4) return
    setJoiningByCode(true)
    try {
      const result = await redeemInviteByCodeFn({
        data: { code: joinCode.trim() },
      })
      gooeyToast.success('Joined workspace', {
        description: `Welcome to ${result.name}!`,
      })
      await router.invalidate()
      await navigate({ to: '/app/time-tracker' })
    } catch (err) {
      // TanStack Router redirects are not real errors
      const isRedirect = err && typeof err === 'object' && 'code' in err
      if (!isRedirect) {
        gooeyToast.error('Invalid code', {
          description:
            err instanceof Error
              ? err.message
              : 'Please check the code and try again.',
        })
      }
    } finally {
      setJoiningByCode(false)
    }
  }

  const queryClient = useQueryClient()

  async function handleSignOut() {
    await authClient.signOut()
    queryClient.clear()
    await navigate({ to: '/auth' })
  }

  return (
    <main className="min-h-screen bg-eggshell px-4 py-6 text-foreground">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-3 no-underline">
          <BrandLogo className="size-9 rounded-full object-contain" />
          <span className="text-sm font-bold text-foreground">
            {BRAND.name}
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 rounded-full border border-stone bg-eggshell px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-warm-taupe"
          >
            <LogOut className="size-3.5" /> Sign out
          </button>
          <ThemeToggle />
        </div>
      </div>

      <section className="mx-auto mt-12 w-full max-w-3xl">
        <p className="m-0 inline-flex rounded-full border border-stone bg-warm-taupe px-3 py-1 text-xs font-bold uppercase tracking-normal text-graphite">
          Welcome, {name || email}
        </p>
        <h1 className="m-0 mt-4 font-display text-heading-sm text-foreground sm:text-heading">
          Let's set up your workspace
        </h1>
        <p className="m-0 mt-3 max-w-2xl text-base leading-7 text-smoke">
          You can create your own workspace and invite your team, or wait for an
          invite from an existing workspace owner.
        </p>

        {mode === 'choose' ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode('create')}
              className="group rounded-xl bg-warm-taupe p-6 text-left transition-colors hover:bg-stone"
            >
              <Sparkles className="size-7 text-graphite" />
              <h2 className="m-0 mt-4 text-lg font-medium text-foreground">
                Create a workspace
              </h2>
              <p className="m-0 mt-2 text-sm leading-6 text-smoke">
                Start your own company or team workspace. You'll be its Owner
                and can invite members.
              </p>
              <span className="mt-4 inline-block text-xs font-bold uppercase tracking-wide text-foreground group-hover:underline">
                Create →
              </span>
            </button>

            <div className="rounded-xl bg-warm-taupe p-6">
              <MailCheck className="size-7 text-graphite" />
              <h2 className="m-0 mt-4 text-lg font-medium text-foreground">
                Waiting for an invite?
              </h2>
              <p className="m-0 mt-2 text-sm leading-6 text-smoke">
                Ask an Owner or Admin to send an invite to{' '}
                <span className="font-semibold text-foreground">{email}</span>.
                You'll get an email with a link to join.
              </p>

              <div className="mt-5 border-t border-stone pt-5">
                <p className="m-0 mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-smoke">
                  <Hash className="size-3.5" />
                  Have a join code?
                </p>
                <form onSubmit={handleJoinByCode} className="flex gap-2">
                  <input
                    value={joinCode}
                    onChange={(e) =>
                      setJoinCode(
                        e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                      )
                    }
                    placeholder="A3K9X2"
                    aria-label="Join code"
                    maxLength={10}
                    className="h-10 flex-1 rounded-md border border-stone bg-eggshell px-3 font-mono text-sm font-bold tracking-widest text-foreground outline-none transition-colors focus:border-ink focus:ring-2 focus:ring-ink/20"
                  />
                  <button
                    type="submit"
                    disabled={joiningByCode || joinCode.trim().length < 4}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary-action px-4 text-sm font-bold text-primary-action-foreground transition-colors hover:bg-primary-action/85 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {joiningByCode ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    Join
                  </button>
                </form>
              </div>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleCreate}
            className="mt-8 grid gap-5 rounded-xl bg-warm-taupe p-6"
          >
            <div className="flex items-center gap-3">
              <Building2 className="size-6 text-graphite" />
              <h2 className="m-0 text-lg font-medium text-foreground">
                New workspace
              </h2>
            </div>

            <label className="grid gap-2 text-sm font-semibold text-foreground">
              Workspace name
              <input
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                placeholder="Acme Inc."
                maxLength={150}
                className="h-11 rounded-md border border-stone bg-eggshell px-3 text-sm text-foreground outline-none transition-colors focus:border-ink focus:ring-2 focus:ring-ink/20"
                required
              />
              <span className="text-xs font-normal text-smoke">
                This is how your team will see your workspace.
              </span>
            </label>

            <label className="grid gap-2 text-sm font-semibold text-foreground">
              Timezone
              <TimezoneSelect
                value={timezone}
                onChange={setTimezone}
                className="h-11 rounded-md border border-stone bg-eggshell px-3 text-sm text-foreground outline-none transition-colors focus:border-ink focus:ring-2 focus:ring-ink/20"
              />
            </label>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => setMode('choose')}
                className="rounded-full border border-stone bg-eggshell px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-warm-taupe"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-full bg-primary-action px-5 py-2.5 text-sm font-bold text-primary-action-foreground shadow-[var(--shadow-whisper)] transition-colors hover:bg-primary-action/85 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Creating…' : 'Create workspace'}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  )
}
