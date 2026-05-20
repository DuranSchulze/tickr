import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from 'goey-toast'
import { createWorkspaceInviteFn } from '#/lib/server/workspace-invites'
import type { TrackerState } from '#/lib/time-tracker/types'

export function InviteMemberForm({
  roles,
  departments,
  onInvited,
}: {
  roles: TrackerState['roles']
  departments: TrackerState['departments']
  onInvited: () => void
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [workspaceRoleId, setWorkspaceRoleId] = useState(roles[0]?.id ?? '')
  const [departmentId, setDepartmentId] = useState('')
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      await createWorkspaceInviteFn({
        data: {
          email,
          workspaceRoleId,
          departmentId: departmentId || undefined,
        },
      })
      await router.invalidate()
      gooeyToast.success('Invitation sent', {
        description: `${email} will receive an email with a link to join.`,
      })
      setEmail('')
      setWorkspaceRoleId(roles[0]?.id ?? '')
      setDepartmentId('')
      onInvited()
    } catch (err) {
      gooeyToast.error('Could not send invitation', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-4 border-b border-border bg-muted p-4 sm:grid-cols-[1fr_160px_200px_auto]"
    >
      <label className="grid gap-1.5 text-xs font-semibold text-foreground">
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="employee@company.com"
          required
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary"
        />
      </label>
      <label className="grid gap-1.5 text-xs font-semibold text-foreground">
        Role
        <select
          value={workspaceRoleId}
          onChange={(e) => setWorkspaceRoleId(e.target.value)}
          required
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary"
        >
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-xs font-semibold text-foreground">
        Department
        <select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="">Unassigned</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-end">
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground"
        >
          {pending ? 'Adding...' : 'Add'}
        </button>
      </div>
    </form>
  )
}
