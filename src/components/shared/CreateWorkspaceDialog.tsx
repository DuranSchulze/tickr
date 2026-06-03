import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { gooeyToast } from 'goey-toast'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { createWorkspaceFn } from '#/lib/server/workspaces'

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (name: string) => void
}) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length < 2) {
      gooeyToast.error('Name too short', {
        description: 'Workspace name must be at least 2 characters.',
      })
      return
    }
    setCreating(true)
    try {
      const created = await createWorkspaceFn({ data: { name: trimmed } })
      onOpenChange(false)
      gooeyToast.success(`"${created.name}" created`, {
        description: 'Switching you over now…',
      })
      onCreated?.(trimmed)
    } catch (err) {
      gooeyToast.error('Could not create workspace', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !creating && onOpenChange(o)}>
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
              htmlFor="create-ws-name"
              className="text-sm font-semibold text-foreground"
            >
              Workspace name
            </label>
            {/* oxlint-disable-next-line jsx-a11y/no-autofocus -- workspace name input in dialog */}
            <input
              id="create-ws-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Corp"
              maxLength={150}
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
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={creating || name.trim().length < 2}
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
  )
}
