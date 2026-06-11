import { useEffect, useState } from 'react'
import { DollarSign } from 'lucide-react'
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
import type { SearchableItem } from '#/components/ui/searchable-create-popover'
import { ClientProjectPicker } from '../pickers/ClientProjectPicker'
import { TagPicker } from '../pickers/TagPicker'

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
  tags: SearchableItem[]
}

/**
 * Create a timer preset. The selection is fully editable here — the current
 * timer values only pre-fill the form, so a preset can be built from scratch
 * without first configuring the timer.
 */
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
  const [draftClientId, setDraftClientId] = useState(clientId)
  const [draftProjectId, setDraftProjectId] = useState(projectId)
  const [draftTagIds, setDraftTagIds] = useState<string[]>(tagIds)
  const [draftBillable, setDraftBillable] = useState(billable)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Re-seed the form from the timer's current selection each time it opens.
  useEffect(() => {
    if (open) {
      setName('')
      setDraftClientId(clientId)
      setDraftProjectId(projectId)
      setDraftTagIds(tagIds)
      setDraftBillable(billable)
      setError(null)
    }
  }, [open, clientId, projectId, tagIds, billable])

  const activeClients = clients.filter((c) => c.clientStatus === 'ACTIVE')

  const canSave = name.trim().length > 0 && draftClientId && draftProjectId

  function handleSave() {
    if (!canSave) return

    setIsSaving(true)
    setError(null)

    const result = savePreset(workspaceId, {
      name: name.trim(),
      clientId: draftClientId,
      projectId: draftProjectId,
      tagIds: draftTagIds.filter(Boolean),
      billable: draftBillable,
    })

    if (result.success) {
      onOpenChange(false)
    } else {
      setError(result.error || 'Failed to save preset')
    }

    setIsSaving(false)
  }

  function handleClose() {
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md overflow-visible">
        <DialogHeader>
          <DialogTitle>New Timer Preset</DialogTitle>
          <DialogDescription>
            Pick a client, project and tags, then name the preset to reuse it
            with one click.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="preset-name">Preset name</Label>
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

          <div className="grid gap-1.5">
            <Label>Client / Project</Label>
            <ClientProjectPicker
              clients={activeClients}
              projects={projects}
              clientId={draftClientId}
              projectId={draftProjectId}
              onChange={(cid, pid) => {
                setDraftClientId(cid)
                setDraftProjectId(pid)
              }}
            />
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
            <div className="grid gap-1.5">
              <Label>Tags</Label>
              <TagPicker
                tags={tags}
                value={draftTagIds}
                onChange={setDraftTagIds}
                onCreate={async () => {}}
                canCreate={false}
              />
            </div>
            <button
              type="button"
              onClick={() => setDraftBillable(!draftBillable)}
              aria-pressed={draftBillable}
              title={draftBillable ? 'Billable' : 'Non-billable'}
              className={`inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors ${
                draftBillable
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              <DollarSign className="size-4" />
              Billable
            </button>
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
