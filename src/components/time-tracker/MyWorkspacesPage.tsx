import { memo, useCallback, useMemo, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from 'goey-toast'
import {
  BriefcaseBusiness,
  Check,
  Crown,
  Loader2,
  LogOut,
  Plus,
  Trash2,
  Users,
} from 'lucide-react'
import {
  deleteWorkspaceFn,
  leaveWorkspaceFn,
  createWorkspaceFn,
} from '#/lib/server/workspaces'
import { setActiveWorkspaceFn } from '#/lib/server/workspace-access'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'

type Workspace = {
  workspaceId: string
  slug: string
  name: string
  role: {
    name: string
    permissionLevel: string
    color: string
  } | null
  status: string
}

interface Props {
  workspaces: Workspace[]
  currentWorkspaceId: string
}

export function MyWorkspacesPage({ workspaces, currentWorkspaceId }: Props) {
  const router = useRouter()
  const [pendingAction, setPendingAction] = useState<{
    type: 'delete' | 'leave'
    workspace: Workspace
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newWsName, setNewWsName] = useState('')
  const [creating, setCreating] = useState(false)

  const owned = useMemo(
    () => workspaces.filter((ws) => ws.role?.permissionLevel === 'OWNER'),
    [workspaces],
  )
  const joined = useMemo(
    () => workspaces.filter((ws) => ws.role?.permissionLevel !== 'OWNER'),
    [workspaces],
  )

  const handleSwitch = useCallback(async (slug: string) => {
    try {
      await setActiveWorkspaceFn({ data: { slug } })
      window.location.assign('/app/time-tracker')
    } catch (err) {
      gooeyToast.error('Could not switch workspace', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    }
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const name = newWsName.trim()
    if (name.length < 2) return
    setCreating(true)
    try {
      const created = await createWorkspaceFn({ data: { name } })
      gooeyToast.success(`"${created.name}" created`, {
        description: 'Switching you over now…',
      })
      window.location.assign('/app/time-tracker')
    } catch (err) {
      gooeyToast.error('Could not create workspace', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setCreating(false)
    }
  }

  async function handleConfirm() {
    if (!pendingAction) return
    setLoading(true)
    const { type, workspace } = pendingAction
    try {
      if (type === 'delete') {
        await deleteWorkspaceFn({
          data: { workspaceId: workspace.workspaceId },
        })
        gooeyToast.success(`"${workspace.name}" deleted`)
      } else {
        await leaveWorkspaceFn({ data: { workspaceId: workspace.workspaceId } })
        gooeyToast.success(`Left "${workspace.name}"`)
      }
      setPendingAction(null)

      // If we deleted/left the current workspace, go to another one or onboarding
      if (workspace.workspaceId === currentWorkspaceId) {
        const next = workspaces.find(
          (ws) => ws.workspaceId !== workspace.workspaceId,
        )
        if (next) {
          await setActiveWorkspaceFn({ data: { slug: next.slug } })
          window.location.assign('/app/time-tracker')
        } else {
          window.location.assign('/onboarding')
        }
      } else {
        await router.invalidate()
      }
    } catch (err) {
      gooeyToast.error(
        type === 'delete'
          ? 'Could not delete workspace'
          : 'Could not leave workspace',
        {
          description: err instanceof Error ? err.message : 'Please try again.',
        },
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 py-2">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Workspaces</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage all workspaces you belong to. You can delete workspaces you own
          or leave ones you've joined.
        </p>
      </div>

      {/* Owned workspaces */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Owned by you ({owned.length})
          </h2>
        </div>

        {owned.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You don't own any workspaces yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {owned.map((ws) => (
              <WorkspaceCard
                key={ws.workspaceId}
                workspace={ws}
                isCurrent={ws.workspaceId === currentWorkspaceId}
                onSwitch={() => void handleSwitch(ws.slug)}
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setPendingAction({ type: 'delete', workspace: ws })
                    }
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5"
                    title="Delete workspace"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                }
              />
            ))}
          </ul>
        )}
      </section>

      {/* Joined workspaces */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Joined workspaces ({joined.length})
          </h2>
        </div>

        {joined.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You haven't joined any workspaces.
          </p>
        ) : (
          <ul className="space-y-2">
            {joined.map((ws) => (
              <WorkspaceCard
                key={ws.workspaceId}
                workspace={ws}
                isCurrent={ws.workspaceId === currentWorkspaceId}
                onSwitch={() => void handleSwitch(ws.slug)}
                action={
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setPendingAction({ type: 'leave', workspace: ws })
                    }
                    className="text-muted-foreground hover:bg-accent hover:text-foreground gap-1.5"
                    title="Leave workspace"
                  >
                    <LogOut className="h-4 w-4" />
                    Leave
                  </Button>
                }
              />
            ))}
          </ul>
        )}
      </section>

      {/* Create new workspace */}
      <section className="border-t border-border pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Create a new workspace
            </p>
            <p className="text-xs text-muted-foreground">
              You'll be the owner with full control.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              setNewWsName('')
              setShowCreate(true)
            }}
          >
            <Plus className="h-4 w-4" />
            New workspace
          </Button>
        </div>
      </section>

      {/* Create workspace dialog */}
      <Dialog
        open={showCreate}
        onOpenChange={(open) => !creating && setShowCreate(open)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create a new workspace</DialogTitle>
            <DialogDescription>
              You'll be the owner and can invite others after setup.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => void handleCreate(e)}
            className="mt-2 flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="page-ws-name"
                className="text-sm font-semibold text-foreground"
              >
                Workspace name
              </label>
              <input
                id="page-ws-name"
                type="text"
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
                placeholder="e.g. Acme Corp"
                maxLength={150}
                autoFocus
                disabled={creating}
                className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={creating}
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={creating || newWsName.trim().length < 2}
              >
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Creating…
                  </>
                ) : (
                  'Create workspace'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm dialog */}
      <Dialog
        open={!!pendingAction}
        onOpenChange={(open) => !loading && !open && setPendingAction(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pendingAction?.type === 'delete'
                ? `Delete "${pendingAction.workspace.name}"?`
                : `Leave "${pendingAction?.workspace.name}"?`}
            </DialogTitle>
            <DialogDescription>
              {pendingAction?.type === 'delete' ? (
                <>
                  This will permanently delete the workspace and{' '}
                  <strong>all its data</strong> — members, time entries,
                  projects, and settings. This cannot be undone.
                </>
              ) : (
                <>
                  You'll lose access to this workspace immediately. You can only
                  rejoin if someone invites you back.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => setPendingAction(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={loading}
              onClick={() => void handleConfirm()}
              className={
                pendingAction?.type === 'delete'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : ''
              }
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  {pendingAction?.type === 'delete' ? 'Deleting…' : 'Leaving…'}
                </>
              ) : pendingAction?.type === 'delete' ? (
                'Delete workspace'
              ) : (
                'Leave workspace'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const WorkspaceCard = memo(function WorkspaceCard({
  workspace,
  isCurrent,
  onSwitch,
  action,
}: {
  workspace: Workspace
  isCurrent: boolean
  onSwitch: () => void
  action: React.ReactNode
}) {
  return (
    <li
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
        isCurrent ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'
      }`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <BriefcaseBusiness className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="m-0 truncate text-sm font-semibold text-foreground">
            {workspace.name}
          </p>
          {isCurrent && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
              <Check className="h-3 w-3" />
              Active
            </span>
          )}
        </div>
        {workspace.role && (
          <p
            className="m-0 text-xs font-medium"
            style={{ color: workspace.role.color }}
          >
            {workspace.role.name}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {!isCurrent && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSwitch}
            className="text-muted-foreground hover:text-foreground"
          >
            Switch
          </Button>
        )}
        {action}
      </div>
    </li>
  )
})
