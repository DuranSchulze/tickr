import { useReducer } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from '#/lib/toast'
import { Plus, X } from 'lucide-react'
import { createWorkspaceRoleFn } from '#/lib/server/tracker'
import type { TrackerState } from '#/lib/time-tracker/types'
import { SectionCard } from '../shared/SectionCard'

const PERMISSION_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
}

type PermissionLevel = 'OWNER' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE'

export function RolesManager({
  state,
  canManage,
}: {
  state: TrackerState
  canManage: boolean
}) {
  const router = useRouter()
  const [local, dispatch] = useReducer(
    (
      s: {
        showForm: boolean
        name: string
        permissionLevel: PermissionLevel
        color: string
        pending: boolean
      },
      a: Partial<typeof s>,
    ) => ({ ...s, ...a }),
    {
      showForm: false,
      name: '',
      permissionLevel: 'EMPLOYEE',
      color: '#6366f1',
      pending: false,
    },
  )
  const { showForm, name, permissionLevel, color, pending } = local

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    dispatch({ pending: true })
    try {
      await createWorkspaceRoleFn({ data: { name, permissionLevel, color } })
      await router.invalidate()
      gooeyToast.success('Role created', {
        description: `"${name}" is now available.`,
      })
      dispatch({
        name: '',
        permissionLevel: 'EMPLOYEE',
        color: '#6366f1',
        showForm: false,
      })
    } catch (err) {
      gooeyToast.error('Could not create role', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      dispatch({ pending: false })
    }
  }

  return (
    <SectionCard
      title="Roles"
      action={
        canManage ? (
          <button
            type="button"
            onClick={() => dispatch({ showForm: !showForm })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-colors hover:brightness-110"
          >
            {showForm ? (
              <X className="size-3.5" />
            ) : (
              <Plus className="size-3.5" />
            )}
            {showForm ? 'Cancel' : 'New role'}
          </button>
        ) : undefined
      }
    >
      {showForm && (
        <form onSubmit={handleCreate} className="mt-4 grid gap-3">
          <input
            value={name}
            onChange={(e) => dispatch({ name: e.target.value })}
            placeholder="Role name (e.g. Senior Engineer)"
            aria-label="Role name"
            required
            className="h-9 rounded-lg border border-border bg-card text-foreground px-3 text-sm outline-none focus:border-primary"
          />
          <div className="flex gap-2">
            <select
              value={permissionLevel}
              onChange={(e) =>
                dispatch({ permissionLevel: e.target.value as PermissionLevel })
              }
              className="h-9 flex-1 rounded-lg border border-border bg-card text-foreground px-3 text-sm outline-none focus:border-primary"
              aria-label="Permission level"
            >
              <option value="EMPLOYEE">Employee (can track time)</option>
              <option value="MANAGER">Manager (can view team)</option>
              <option value="ADMIN">Admin (can manage workspace)</option>
              <option value="OWNER">Owner (full access)</option>
            </select>
            <input
              type="color"
              value={color}
              onChange={(e) => dispatch({ color: e.target.value })}
              className="h-9 w-12 cursor-pointer rounded-lg border border-border p-1"
              title="Role color"
              aria-label="Role color"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="h-9 rounded-lg bg-primary text-sm font-bold text-primary-foreground transition-colors hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground"
          >
            {pending ? 'Creating…' : 'Create role'}
          </button>
        </form>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {state.roles.map((role) => (
          <div
            key={role.id}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2"
          >
            <span
              className="inline-block size-2.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: role.color }}
            />
            <span className="text-sm font-semibold text-foreground">
              {role.name}
            </span>
            <span className="ml-1 text-xs text-muted-foreground">
              {PERMISSION_LABELS[role.permissionLevel]}
            </span>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}
