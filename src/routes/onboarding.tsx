import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from '@tanstack/react-router'
import { useState } from 'react'
import { Building2, MailCheck, Sparkles, LogOut } from 'lucide-react'
import { BRAND } from '#/lib/brand'
import { gooeyToast } from 'goey-toast'
import { authClient } from '#/lib/auth-client'
import { getSessionFn } from '#/lib/server/session'
import { listUserWorkspacesFn } from '#/lib/server/workspace-access'
import { createWorkspaceFn } from '#/lib/server/workspaces'
import { ThemeToggle } from '#/components/ui/theme-toggle'
import { TimezoneSelect } from '#/components/ui/TimezoneSelect'

export const Route = createFileRoute('/onboarding')({
  loader: async () => {
    const session = await getSessionFn()
    if (!session?.user) {
      throw redirect({ to: '/auth' })
    }
    const workspaces = await listUserWorkspacesFn()
    if (workspaces.length > 0) {
      throw redirect({ to: '/app/time-tracker' })
    }
    return {
      email: session.user.email,
      name: session.user.name,
    }
  },
  component: OnboardingPage,
})

function OnboardingPage() {
  const { email, name } = Route.useLoaderData()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'choose' | 'create'>('choose')
  const [wsName, setWsName] = useState('')
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Manila',
  )
  const [loading, setLoading] = useState(false)

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
      await createWorkspaceFn({ data: { name: wsName.trim(), timezone } })
      gooeyToast.success('Workspace created', {
        description: 'Welcome aboard!',
      })
      await navigate({ to: '/app/time-tracker' })
    } catch (err) {
      gooeyToast.error('Could not create workspace', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleSignOut() {
    await authClient.signOut()
    await navigate({ to: '/auth' })
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-3 no-underline">
          <img
            src={BRAND.logoSrc}
            alt={BRAND.logoAlt}
            className="h-9 w-9 rounded-lg object-contain"
          />
          <span className="text-sm font-bold text-slate-950 dark:text-slate-50">
            {BRAND.name}
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
          <ThemeToggle />
        </div>
      </div>

      <section className="mx-auto mt-12 w-full max-w-3xl">
        <p className="m-0 inline-flex rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-bold uppercase tracking-normal text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-200">
          Welcome, {name || email}
        </p>
        <h1 className="m-0 mt-4 text-3xl font-black tracking-tight sm:text-4xl">
          Let's set up your workspace
        </h1>
        <p className="m-0 mt-3 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">
          You can create your own workspace and invite your team, or wait for an
          invite from an existing workspace owner.
        </p>

        {mode === 'choose' ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode('create')}
              className="group rounded-xl border-2 border-slate-200 bg-white p-6 text-left transition-all hover:border-indigo-500 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-400"
            >
              <Sparkles className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
              <h2 className="m-0 mt-4 text-lg font-black">
                Create a workspace
              </h2>
              <p className="m-0 mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                Start your own company or team workspace. You'll be its Owner
                and can invite members.
              </p>
              <span className="mt-4 inline-block text-xs font-bold uppercase tracking-wide text-indigo-700 group-hover:underline dark:text-indigo-300">
                Create →
              </span>
            </button>

            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <MailCheck className="h-7 w-7 text-teal-600 dark:text-teal-400" />
              <h2 className="m-0 mt-4 text-lg font-black">
                Waiting for an invite?
              </h2>
              <p className="m-0 mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                Ask an Owner or Admin to send an invite to{' '}
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {email}
                </span>
                . You'll get an email with a link to join.
              </p>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleCreate}
            className="mt-8 grid gap-5 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center gap-3">
              <Building2 className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
              <h2 className="m-0 text-lg font-black">New workspace</h2>
            </div>

            <label className="grid gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Workspace name
              <input
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                placeholder="Acme Inc."
                maxLength={150}
                className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
                required
              />
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                This is how your team will see your workspace.
              </span>
            </label>

            <label className="grid gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Timezone
              <TimezoneSelect
                value={timezone}
                onChange={setTimezone}
                className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50"
              />
            </label>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => setMode('choose')}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
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
