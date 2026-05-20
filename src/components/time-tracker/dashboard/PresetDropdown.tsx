import { useMemo, useState } from 'react'
import { Bookmark, ChevronDown, Plus, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Button } from '#/components/ui/button'
import { getPresets, deletePreset } from '#/lib/time-tracker/presets'
import type { Client, Project, Tag } from '#/lib/time-tracker/types'
import { SavePresetDialog } from './SavePresetDialog'

type PresetDropdownProps = {
  workspaceId: string
  clientId: string
  projectId: string
  tagIds: string[]
  billable: boolean
  clients: Client[]
  projects: Project[]
  tags: Tag[]
  onApplyPreset: (preset: {
    clientId: string
    projectId: string
    tagIds: string[]
    billable: boolean
  }) => void
}

export function PresetDropdown({
  workspaceId,
  clientId,
  projectId,
  tagIds,
  billable,
  clients,
  projects,
  tags,
  onApplyPreset,
}: PresetDropdownProps) {
  const [open, setOpen] = useState(false)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [, forceUpdate] = useState({})

  const presets = useMemo(() => getPresets(workspaceId), [workspaceId, open])

  const canSaveCurrent = clientId && projectId

  function handleApplyPreset(preset: {
    clientId: string
    projectId: string
    tagIds: string[]
    billable: boolean
  }) {
    onApplyPreset(preset)
    setOpen(false)
  }

  function handleDeletePreset(e: React.MouseEvent, presetId: string) {
    e.stopPropagation()
    deletePreset(workspaceId, presetId)
    forceUpdate({})
  }

  function handleOpenSaveDialog() {
    setOpen(false)
    setSaveDialogOpen(true)
  }

  function handleSaveDialogClose(isOpen: boolean) {
    setSaveDialogOpen(isOpen)
    if (!isOpen) {
      forceUpdate({})
    }
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="inline-flex h-11 items-center justify-center gap-2 px-3"
          >
            <Bookmark className="h-4 w-4" />
            <span className="hidden sm:inline">Presets</span>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {presets.length === 0 ? (
            <DropdownMenuItem disabled>
              <span className="text-muted-foreground">No saved presets</span>
            </DropdownMenuItem>
          ) : (
            presets.map((preset) => {
              const client = clients.find((c) => c.id === preset.clientId)
              const project = projects.find((p) => p.id === preset.projectId)
              const presetTags = tags.filter((t) =>
                preset.tagIds.includes(t.id),
              )

              return (
                <DropdownMenuItem
                  key={preset.id}
                  onClick={() => handleApplyPreset(preset)}
                  className="flex items-start justify-between gap-2 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{preset.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {client?.name || 'Unknown client'} •{' '}
                      {project?.name || 'Unknown project'}
                      {presetTags.length > 0 &&
                        ` • ${presetTags.map((t) => t.name).join(', ')}`}
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDeletePreset(e, preset.id)}
                    className="shrink-0 p-1 rounded-sm hover:bg-accent hover:text-destructive opacity-0 group-hover:opacity-100 focus:opacity-100"
                    tabIndex={-1}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuItem>
              )
            })
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={handleOpenSaveDialog}
            disabled={!canSaveCurrent}
          >
            <Plus className="mr-2 h-4 w-4" />
            Save current as preset...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SavePresetDialog
        open={saveDialogOpen}
        onOpenChange={handleSaveDialogClose}
        workspaceId={workspaceId}
        clientId={clientId}
        projectId={projectId}
        tagIds={tagIds}
        billable={billable}
        clients={clients}
        projects={projects}
        tags={tags}
      />
    </>
  )
}
