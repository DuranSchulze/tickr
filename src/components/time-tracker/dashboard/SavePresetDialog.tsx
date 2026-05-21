import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { savePreset } from '#/lib/time-tracker/presets'
import type { Client, Project } from '#/lib/time-tracker/types'

type SavePresetDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  clientId: string
  projectId: string
  tagIds: string[]
  billable: boolean
  clients: Client[]
  projects: Project[]
  tags: { id: string; name: string }[]
}

export function SavePresetDialog({
  open,
  onOpenChange,
  workspaceId,
  clientId,
  projectId,
  tagIds,
  billable,
  clients,
  projects,
  tags,
}: SavePresetDialogProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const client = clients.find((c) => c.id === clientId)
  const project = projects.find((p) => p.id === projectId)
  const selectedTags = tags.filter((t) => tagIds.includes(t.id))

  const canSave = name.trim().length > 0 && clientId && projectId

  function handleSave() {
    if (!canSave) return

    setIsSaving(true)
    setError(null)

    const result = savePreset(workspaceId, {
      name: name.trim(),
      clientId,
      projectId,
      tagIds,
      billable,
    })

    if (result.success) {
      setName('')
      onOpenChange(false)
    } else {
      setError(result.error || 'Failed to save preset')
    }

    setIsSaving(false)
  }

  function handleClose() {
    setName('')
    setError(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save Timer Preset</DialogTitle>
          <DialogDescription>
            Give this timer configuration a name to reuse it later.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="preset-name">Preset Name</Label>
            <Input
              id="preset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Morning Standup"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave()
              }}
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm">
            <p className="m-0 mb-2 font-semibold text-muted-foreground">
              Current selection:
            </p>
            <div className="grid gap-1 text-muted-foreground">
              <div>
                <span className="font-medium">Client:</span>{' '}
                {client?.name || 'None selected'}
              </div>
              <div>
                <span className="font-medium">Project:</span>{' '}
                {project?.name || 'None selected'}
              </div>
              <div>
                <span className="font-medium">Tags:</span>{' '}
                {selectedTags.length > 0
                  ? selectedTags.map((t) => t.name).join(', ')
                  : 'None'}
              </div>
              <div>
                <span className="font-medium">Billable:</span>{' '}
                {billable ? 'Yes' : 'No'}
              </div>
            </div>
          </div>

          {error && (
            <p className="m-0 text-sm font-semibold text-destructive">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || isSaving}>
            Save Preset
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
