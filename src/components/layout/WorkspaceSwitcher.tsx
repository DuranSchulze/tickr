import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BriefcaseBusiness,
  Check,
  ChevronDown,
  LayoutGrid,
  Loader2,
  Plus,
} from 'lucide-react'
import { gooeyToast } from '#/lib/toast'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '#/components/ui/dialog'
import {
  listUserWorkspacesFn,
  setActiveWorkspaceFn,
} from '#/lib/server/workspace-access'
import { createWorkspaceFn } from '#/lib/server/workspaces'

export function WorkspaceSwitcher({
  currentWorkspaceId,
  currentWorkspaceName,
  permissionLevel,
  collapsed = false,
}: {
  currentWorkspaceId: string
  currentWorkspaceName: string
  permissionLevel: string
  collapsed?: boolean
}) {
  const canCreate = permissionLevel === 'OWNER' || permissionLevel === 'ADMIN'
  const queryClient = useQueryClient()
  const { data: workspaces = [] } = useQuery({
    queryKey: ['user-workspaces'],
    queryFn: () => listUserWorkspacesFn(),
    staleTime: 60 * 1000,
  })

  const [showCreate, setShowCreate] = useState(false)
  const [wsName, setWsName] = useState('')
  const [creating, setCreating] = useState(false)

  async function handleSwitch(slug: string) {
    try {
      await setActiveWorkspaceFn({ data: { slug } })
      window.location.assign('/app/time-tracker')
    } catch (err) {
      gooeyToast.error('Could not switch workspace', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    }
  }

  function openCreateDialog() {
    setWsName('')
    setShowCreate(true)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const name = wsName.trim()
    if (name.length < 2) {
      gooeyToast.error('Name too short', {
        description: 'Workspace name must be at least 2 characters.',
      })
      return
    }
    setCreating(true)
    try {
      const created = await createWorkspaceFn({ data: { name } })
      await queryClient.invalidateQueries({ queryKey: ['user-workspaces'] })
      setShowCreate(false)
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

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size={collapsed ? 'icon' : 'default'}
            title="Switch workspace"
            className={
              collapsed
                ? 'size-9 rounded-full border border-stone bg-eggshell p-0 text-foreground hover:bg-warm-taupe'
                : 'w-full justify-start gap-2 rounded-xl border border-stone bg-eggshell px-3 text-foreground hover:bg-warm-taupe'
            }
          >
            <BriefcaseBusiness className="size-4 shrink-0 text-primary" />
            {!collapsed && (
              <span className="min-w-0 truncate font-semibold">
                {currentWorkspaceName}
              </span>
            )}
            {!collapsed && (
              <ChevronDown className="ml-auto size-3.5 shrink-0 text-smoke" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side={collapsed ? 'right' : 'top'}
          align={collapsed ? 'start' : 'center'}
          className="w-64"
        >
          <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-smoke">
            Your workspaces
          </DropdownMenuLabel>
          {workspaces.length === 0 && (
            <DropdownMenuItem disabled className="text-sm text-smoke">
              No workspaces yet
            </DropdownMenuItem>
          )}
          {workspaces.map((ws) => {
            // `name` is not unique (only `slug` is), so two same-named
            // workspaces both looked "current" and neither could be switched to.
            const isCurrent = ws.workspaceId === currentWorkspaceId
            return (
              <DropdownMenuItem
                key={ws.workspaceId}
                onSelect={(e) => {
                  e.preventDefault()
                  if (!isCurrent) void handleSwitch(ws.slug)
                }}
                className={`flex items-start gap-2 ${
                  isCurrent ? 'bg-warm-taupe' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="m-0 truncate text-sm font-semibold">
                    {ws.name}
                  </p>
                  {ws.role && (
                    <p
                      className="m-0 text-xs"
                      style={{
                        // Blend the role's hue with the inherited popover
                        // text color so it stays readable in light and dark.
                        color: `color-mix(in oklab, ${ws.role.color} 60%, currentColor)`,
                      }}
                    >
                      {ws.role.name}
                    </p>
                  )}
                </div>
                {isCurrent && (
                  <Check className="mt-0.5 size-4 text-primary shrink-0" />
                )}
              </DropdownMenuItem>
            )
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="flex items-center gap-2 text-sm">
            <Link to="/app/my-workspaces">
              <LayoutGrid className="size-4" /> My Workspaces
            </Link>
          </DropdownMenuItem>
          {canCreate && (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault()
                openCreateDialog()
              }}
              className="flex items-center gap-2 text-sm font-semibold text-primary"
            >
              <Plus className="size-4" /> Create a workspace
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

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
                htmlFor="ws-name"
                className="text-sm font-semibold text-foreground"
              >
                Workspace name
              </label>
              {/* oxlint-disable-next-line jsx-a11y/no-autofocus -- workspace name input */}
              <input
                id="ws-name"
                type="text"
                value={wsName}
                onChange={(e) => setWsName(e.target.value)}
                placeholder="e.g. Acme Corp"
                maxLength={150}
                disabled={creating}
                className="h-9 rounded-md border border-stone bg-eggshell px-3 text-sm text-foreground placeholder:text-smoke focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
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
                disabled={creating || wsName.trim().length < 2}
              >
                {creating ? (
                  <>
                    <Loader2 className="mr-2 size-3.5 animate-spin" />
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
    </>
  )
}
