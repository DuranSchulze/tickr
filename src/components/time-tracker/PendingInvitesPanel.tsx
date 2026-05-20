import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from 'goey-toast'
import {
  listWorkspaceInvitesFn,
  resendWorkspaceInviteFn,
  revokeWorkspaceInviteFn,
} from '#/lib/server/workspace-invites'

export function PendingInvitesPanel() {
  const router = useRouter()
  const { data: invites = [], refetch } = useQuery({
    queryKey: ['workspace-invites'],
    queryFn: () => listWorkspaceInvitesFn(),
    staleTime: 30 * 1000,
  })
  const [busyId, setBusyId] = useState<string | null>(null)

  if (invites.length === 0) return null

  async function handleResend(id: string) {
    setBusyId(id)
    try {
      await resendWorkspaceInviteFn({ data: { inviteId: id } })
      await refetch()
      gooeyToast.success('Invitation resent')
    } catch (err) {
      gooeyToast.error('Could not resend', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setBusyId(null)
    }
  }

  async function handleRevoke(id: string) {
    setBusyId(id)
    try {
      await revokeWorkspaceInviteFn({ data: { inviteId: id } })
      await refetch()
      await router.invalidate()
      gooeyToast.success('Invitation revoked')
    } catch (err) {
      gooeyToast.error('Could not revoke', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card shadow-sm">
      <div className="border-b border-border p-4">
        <h2 className="m-0 text-lg font-bold text-foreground">
          Pending invitations ({invites.length})
        </h2>
        <p className="m-0 mt-1 text-sm text-muted-foreground">
          These people have been sent an invite link but have not joined yet.
        </p>
      </div>
      <ul className="m-0 grid list-none gap-0 p-0">
        {invites.map((invite) => {
          const expires = new Date(invite.expiresAt)
          const isExpired = expires < new Date()
          return (
            <li
              key={invite.id}
              className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-sm font-semibold text-foreground">
                  {invite.email}
                </p>
                <p className="m-0 mt-0.5 text-xs text-muted-foreground">
                  {invite.roleName ?? 'Member'}
                  {invite.departmentName ? ` · ${invite.departmentName}` : ''}
                  {' · '}
                  {isExpired ? (
                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                      Expired {expires.toLocaleDateString()}
                    </span>
                  ) : (
                    <>Expires {expires.toLocaleDateString()}</>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleResend(invite.id)}
                  disabled={busyId === invite.id}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                >
                  Resend
                </button>
                <button
                  type="button"
                  onClick={() => void handleRevoke(invite.id)}
                  disabled={busyId === invite.id}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                >
                  Revoke
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
