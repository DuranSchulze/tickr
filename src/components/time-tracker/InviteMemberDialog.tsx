import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Loader2, Mail } from 'lucide-react'
import { gooeyToast } from 'goey-toast'
import { createWorkspaceInviteFn } from '#/lib/server/workspace-invites'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'
import type { TrackerState } from '#/lib/time-tracker/types'

export function InviteMemberDialog({
  open,
  onOpenChange,
  roles,
  departments,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  roles: TrackerState['roles']
  departments: TrackerState['departments']
}) {
  const router = useRouter()
  const [emailsText, setEmailsText] = useState('')
  const [workspaceRoleId, setWorkspaceRoleId] = useState(roles[0]?.id ?? '')
  const [departmentId, setDepartmentId] = useState('')
  const [pending, setPending] = useState(false)

  function parseEmails(text: string): string[] {
    return text
      .split(/[\n,]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0 && e.includes('@'))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const emails = parseEmails(emailsText)
    if (emails.length === 0) return

    setPending(true)
    let successCount = 0
    let failCount = 0
    const errors: Array<{ email: string; error: string }> = []

    for (const email of emails) {
      try {
        await createWorkspaceInviteFn({
          data: {
            email,
            workspaceRoleId,
            departmentId: departmentId || undefined,
          },
        })
        successCount++
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error('Invite failed for', email, message)
        errors.push({ email, error: message })
        failCount++
      }
    }

    await router.invalidate()

    if (successCount > 0) {
      gooeyToast.success(`Invitation${successCount > 1 ? 's' : ''} sent`, {
        description:
          successCount === 1
            ? `${emails[0]} will receive an email with a link to join.`
            : `${successCount} invitation${successCount > 1 ? 's' : ''} sent successfully.${failCount > 0 ? ` ${failCount} failed.` : ''}`,
      })
    } else if (failCount > 0) {
      const errorMessages = errors
        .slice(0, 3)
        .map((f) => `${f.email}: ${f.error}`)
        .join('; ')
      const suffix = errors.length > 3 ? ` (and ${errors.length - 3} more)` : ''
      gooeyToast.error('Could not send invitations', {
        description: `${failCount} invitation${failCount > 1 ? 's' : ''} failed. ${errorMessages}${suffix}`,
      })
    }

    if (failCount === 0) {
      setEmailsText('')
      setWorkspaceRoleId(roles[0]?.id ?? '')
      setDepartmentId('')
      onOpenChange(false)
    }
    setPending(false)
  }

  const emailCount = parseEmails(emailsText).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite members</DialogTitle>
          <DialogDescription>
            Add one or more email addresses. Separate multiple emails with
            commas or new lines.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          {/* Emails */}
          <label className="grid gap-1.5 text-xs font-semibold text-foreground">
            Email addresses
            <textarea
              value={emailsText}
              onChange={(e) => setEmailsText(e.target.value)}
              placeholder="employee@company.com&#10;colleague@company.com&#10;another@company.com"
              rows={3}
              required
              className="h-20 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary resize-none"
            />
            {emailCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {emailCount} email{emailCount > 1 ? 's' : ''} detected
              </span>
            )}
          </label>

          {/* Role + Department */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-semibold text-foreground min-w-0">
              Role
              <select
                value={workspaceRoleId}
                onChange={(e) => setWorkspaceRoleId(e.target.value)}
                required
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-semibold text-foreground min-w-0">
              Department
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="">Unassigned</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <DialogFooter className="mt-2">
            <DialogClose asChild>
              <Button variant="outline" type="button" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending || emailCount === 0}>
              {pending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Inviting...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Invite{emailCount > 1 ? ` (${emailCount})` : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
