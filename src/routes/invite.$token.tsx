import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useState } from 'react'
import { Mail, AlertTriangle, LogOut } from 'lucide-react'
import { gooeyToast } from 'goey-toast'
import { authClient } from '#/lib/auth-client'
import { getSessionFn } from '#/lib/server/session'
import { acceptInviteFn, previewInviteFn } from '#/lib/server/workspace-invites'
import { ThemeToggle } from '#/components/ui/theme-toggle'
import { BRAND } from '#/lib/brand'

export const Route = createFileRoute('/invite/$token')({
  loader: async ({ params }) => {
    const session = await getSessionFn()
    const preview = await previewInviteFn({ data: { token: params.token } })
    return {
      token: params.token,
      preview,
      signedInEmail: session?.user.email ?? null,
      signedInName: session?.user.name ?? null,
    }
  },
  component: InvitePage,
})

function InvitePage() {
  const { token, preview, signedInEmail, signedInName } = Route.useLoaderData()
  const navigate = useNavigate()
  const router = useRouter()
  const [accepting, setAccepting] = useState(false)

  async function refreshWorkspaceState(): Promise<void> {
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
  }

  const emailsMatch =
    signedInEmail &&
    preview.status === 'ready' &&
    signedInEmail.toLowerCase() === preview.inviteEmail.toLowerCase()

  async function handleAccept() {
    setAccepting(true)
    try {
      const acceptedInvite = await acceptInviteFn({ data: { token } })
      await refreshWorkspaceState()
      gooeyToast.success('Invitation accepted', {
        description: `Welcome to ${acceptedInvite.name}.`,
      })
      await navigate({ to: '/app/time-tracker' })
    } catch (err) {
      gooeyToast.error('Could not accept invitation', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setAccepting(false)
    }
  }

  async function handleSwitchAccount() {
    await authClient.signOut()
    await refreshWorkspaceState()
    await navigate({
      to: '/auth',
      search: { invite: token, email: preview.inviteEmail },
    })
  }

  async function handleContinueToApp(): Promise<void> {
    setAccepting(true)
    try {
      await refreshWorkspaceState()
      await navigate({ to: '/app/time-tracker' })
    } finally {
      setAccepting(false)
    }
  }

  function handleSignInToAccept() {
    void navigate({
      to: '/auth',
      search: { invite: token, email: preview.inviteEmail },
    })
  }

  const heading = getHeading(preview.status)

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-3 no-underline">
          <img
            src={BRAND.logoSrc}
            alt={BRAND.logoAlt}
            className="h-9 w-9 rounded-lg object-contain"
          />
          <span className="text-sm font-bold">{BRAND.name}</span>
        </Link>
        <ThemeToggle />
      </div>

      <section className="mx-auto mt-16 w-full max-w-xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <Mail className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
        <h1 className="m-0 mt-4 text-2xl font-black tracking-tight">
          {heading}
        </h1>

        {preview.status === 'not_found' ? (
          <p className="m-0 mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">
            This invite link is not valid. Ask for a fresh invite.
          </p>
        ) : (
          <>
            <p className="m-0 mt-3 text-sm leading-6 text-slate-600 dark:text-slate-400">
              {preview.inviterName ? (
                <>
                  <strong className="text-slate-900 dark:text-slate-100">
                    {preview.inviterName}
                  </strong>{' '}
                  invited{' '}
                </>
              ) : (
                'You were invited to '
              )}
              <strong className="text-slate-900 dark:text-slate-100">
                {preview.inviteEmail}
              </strong>{' '}
              to join{' '}
              <strong className="text-slate-900 dark:text-slate-100">
                {preview.workspaceName}
              </strong>{' '}
              as{' '}
              <strong className="text-slate-900 dark:text-slate-100">
                {preview.roleName}
              </strong>
              .
            </p>

            {preview.status === 'expired' && (
              <StatusNotice tone="warn" icon={AlertTriangle}>
                This invitation has expired. Ask your Owner or Admin to resend
                it.
              </StatusNotice>
            )}
            {preview.status === 'revoked' && (
              <StatusNotice tone="warn" icon={AlertTriangle}>
                This invitation was revoked.
              </StatusNotice>
            )}
            {preview.status === 'already_accepted' && (
              <>
                <StatusNotice tone="info" icon={Mail}>
                  This invitation has already been accepted.
                </StatusNotice>
                {signedInEmail && (
                  <button
                    type="button"
                    onClick={handleContinueToApp}
                    disabled={accepting}
                    className="mt-5 h-11 w-full rounded-lg bg-indigo-600 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {accepting ? 'Checking access…' : 'Continue to workspace'}
                  </button>
                )}
              </>
            )}

            {preview.status === 'ready' && (
              <div className="mt-6 grid gap-3">
                {!signedInEmail && (
                  <button
                    type="button"
                    onClick={handleSignInToAccept}
                    className="h-11 rounded-lg bg-indigo-600 text-sm font-bold text-white transition-colors hover:bg-indigo-700"
                  >
                    Sign in or create account to accept
                  </button>
                )}
                {signedInEmail && emailsMatch && (
                  <button
                    type="button"
                    onClick={handleAccept}
                    disabled={accepting}
                    className="h-11 rounded-lg bg-indigo-600 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {accepting
                      ? 'Accepting…'
                      : `Accept invitation as ${signedInName || signedInEmail}`}
                  </button>
                )}
                {signedInEmail && !emailsMatch && (
                  <>
                    <StatusNotice tone="warn" icon={AlertTriangle}>
                      You are signed in as <strong>{signedInEmail}</strong>, but
                      this invitation is for{' '}
                      <strong>{preview.inviteEmail}</strong>.
                    </StatusNotice>
                    <button
                      type="button"
                      onClick={handleSwitchAccount}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 text-sm font-semibold transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      <LogOut className="h-4 w-4" /> Sign out &amp; use{' '}
                      {preview.inviteEmail}
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  )
}

function getHeading(status: string): string {
  switch (status) {
    case 'expired':
      return 'Invitation expired'
    case 'revoked':
      return 'Invitation revoked'
    case 'already_accepted':
      return 'Invitation already accepted'
    case 'not_found':
      return 'Invitation not found'
    default:
      return "You're invited"
  }
}

function StatusNotice({
  tone,
  icon: Icon,
  children,
}: {
  tone: 'warn' | 'info'
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  const toneClass =
    tone === 'warn'
      ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200'
      : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
  return (
    <div
      className={`mt-5 flex items-start gap-3 rounded-lg border p-3 text-sm ${toneClass}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  )
}
