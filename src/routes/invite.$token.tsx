import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useState } from 'react'
import { Mail, AlertTriangle, LogOut } from 'lucide-react'
import { gooeyToast } from '#/lib/toast'
import { authClient } from '#/lib/auth-client'
import { getSessionFn } from '#/lib/server/session'
import { acceptInviteFn, previewInviteFn } from '#/lib/server/workspace-invites'
import { ThemeToggle } from '#/components/ui/theme-toggle'
import { BrandLogo } from '#/components/ui/BrandLogo'
import { BRAND } from '#/lib/brand'
import { workspaceAuthorizationKeys } from '#/lib/time-tracker/workspace-authorization'

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

// oxlint-disable-next-line react/only-export-components
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
        queryKey: workspaceAuthorizationKeys.all,
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
    router.options.context.queryClient.clear()
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
    <main className="min-h-screen bg-eggshell px-4 py-6 text-foreground">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-3 no-underline">
          <BrandLogo className="size-9 rounded-full object-contain" />
          <span className="text-sm font-bold">{BRAND.name}</span>
        </Link>
        <ThemeToggle />
      </div>

      <section className="mx-auto mt-16 w-full max-w-xl rounded-xl border border-stone bg-eggshell p-8 shadow-[var(--shadow-whisper)]">
        <Mail className="size-8 text-graphite" />
        <h1 className="m-0 mt-4 font-display text-2xl text-foreground">
          {heading}
        </h1>

        {preview.status === 'not_found' ? (
          <p className="m-0 mt-3 text-sm leading-6 text-smoke">
            This invite link is not valid. Ask for a fresh invite.
          </p>
        ) : (
          <>
            <p className="m-0 mt-3 text-sm leading-6 text-smoke">
              {preview.inviterName ? (
                <>
                  <strong className="text-foreground">
                    {preview.inviterName}
                  </strong>{' '}
                  invited{' '}
                </>
              ) : (
                'You were invited to '
              )}
              <strong className="text-foreground">{preview.inviteEmail}</strong>{' '}
              to join{' '}
              <strong className="text-foreground">
                {preview.workspaceName}
              </strong>{' '}
              as <strong className="text-foreground">{preview.roleName}</strong>
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
                    className="mt-5 h-11 w-full rounded-full bg-primary-action text-sm font-bold text-primary-action-foreground transition-colors hover:bg-primary-action/85 disabled:cursor-not-allowed disabled:opacity-60"
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
                    className="h-11 rounded-full bg-primary-action text-sm font-bold text-primary-action-foreground transition-colors hover:bg-primary-action/85"
                  >
                    Sign in or create account to accept
                  </button>
                )}
                {signedInEmail && emailsMatch && (
                  <button
                    type="button"
                    onClick={handleAccept}
                    disabled={accepting}
                    className="h-11 rounded-full bg-primary-action text-sm font-bold text-primary-action-foreground transition-colors hover:bg-primary-action/85 disabled:cursor-not-allowed disabled:opacity-60"
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
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-stone bg-eggshell text-sm font-semibold text-foreground transition-colors hover:bg-warm-taupe"
                    >
                      <LogOut className="size-4" /> Sign out &amp; use{' '}
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

// oxlint-disable-next-line react/only-export-components
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
      : 'border-stone bg-warm-taupe text-graphite'
  return (
    <div
      className={`mt-5 flex items-start gap-3 rounded-xl border p-3 text-sm ${toneClass}`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  )
}
