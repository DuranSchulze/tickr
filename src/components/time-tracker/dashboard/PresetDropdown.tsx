import { useMemo, useState } from 'react'
import { Bookmark, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Button } from '#/components/ui/button'
import type { TimerPreset } from '#/lib/time-tracker/presets'
import { deleteTimerPresetFn, listTimerPresetsFn } from '#/lib/server/tracker'
import { trackerKeys } from '#/lib/time-tracker/query-keys'
import { useNetworkStatus } from '#/lib/time-tracker/useNetworkStatus'
import type { Client, Project, Tag } from '#/lib/time-tracker/types'
import { gooeyToast } from '#/lib/toast'
import { SavePresetDialog } from './SavePresetDialog'

type PresetDropdownProps = {
  workspaceId: string
  clientId: string
  projectId: string
  taskId: string
  tagIds: string[]
  billable: boolean
  clients: Client[]
  projects: Project[]
  projectTasks: Array<{ id: string; projectId: string; name: string }>
  tags: Tag[]
  onApplyPreset: (preset: {
    clientId: string
    projectId: string
    taskId: string
    tagIds: string[]
    billable: boolean
  }) => void
  /** Compact icon-only trigger for use inside the unified timer bar. */
  bare?: boolean
}

export function PresetDropdown({
  workspaceId,
  clientId,
  projectId,
  taskId,
  tagIds,
  billable,
  clients,
  projects,
  projectTasks,
  tags,
  onApplyPreset,
  bare = false,
}: PresetDropdownProps) {
  const [open, setOpen] = useState(false)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const { isOnline } = useNetworkStatus()
  const queryClient = useQueryClient()
  const presetsQueryKey = useMemo(
    () => trackerKeys.timerPresets(workspaceId),
    [workspaceId],
  )

  const { data: presets = [], isLoading } = useQuery({
    queryKey: presetsQueryKey,
    queryFn: () => listTimerPresetsFn(),
    staleTime: 60_000,
    enabled: isOnline,
  })

  // Presets are purely server-side — hide the feature entirely when offline.
  if (!isOnline) return null

  function handleApplyPreset(preset: {
    clientId: string
    projectId: string
    taskId: string
    tagIds: string[]
    billable: boolean
  }) {
    onApplyPreset(preset)
    setOpen(false)
  }

  async function handleDeletePreset(e: React.MouseEvent, presetId: string) {
    e.stopPropagation()
    const previous = queryClient.getQueryData<TimerPreset[]>(presetsQueryKey)

    // Optimistically remove from the cache immediately.
    queryClient.setQueryData<TimerPreset[]>(presetsQueryKey, (old) =>
      old ? old.filter((preset) => preset.id !== presetId) : old,
    )

    try {
      await deleteTimerPresetFn({ data: { id: presetId } })
    } catch (err) {
      queryClient.setQueryData(presetsQueryKey, previous)
      gooeyToast.error('Could not delete preset', {
        description:
          err instanceof Error ? err.message : 'Something went wrong.',
      })
    }
  }

  function handleOpenSaveDialog() {
    setOpen(false)
    setSaveDialogOpen(true)
  }

  function handleSaveDialogClose(isOpen: boolean) {
    setSaveDialogOpen(isOpen)
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          {bare ? (
            <button
              type="button"
              title="Presets"
              aria-label="Presets"
              className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Bookmark className="size-4" />
            </button>
          ) : (
            <Button
              variant="outline"
              className="inline-flex h-11 items-center justify-center gap-2 px-3"
            >
              <Bookmark className="size-4" />
              <span className="hidden sm:inline">Presets</span>
              <ChevronDown className="size-4" />
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <p className="m-0 px-2 pb-1 pt-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Presets
          </p>
          {isLoading ? (
            <p className="m-0 px-2 pb-2 pt-1 text-sm text-muted-foreground">
              Loading presets…
            </p>
          ) : presets.length === 0 ? (
            <p className="m-0 px-2 pb-2 pt-1 text-sm text-muted-foreground">
              No presets yet — create one below.
            </p>
          ) : (
            presets.map((preset) => {
              const client = clients.find((c) => c.id === preset.clientId)
              const project = projects.find((p) => p.id === preset.projectId)
              const task = preset.taskId
                ? projectTasks.find((t) => t.id === preset.taskId)
                : undefined
              const presetTags = tags.filter((t) =>
                preset.tagIds.includes(t.id),
              )

              return (
                <DropdownMenuItem
                  key={preset.id}
                  onClick={() =>
                    handleApplyPreset({
                      ...preset,
                      taskId: preset.taskId ?? '',
                    })
                  }
                  className="group flex items-center justify-between gap-2 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: project?.color ?? '#94a3b8' }}
                      />
                      <span className="truncate font-semibold">
                        {preset.name}
                      </span>
                      {preset.billable && (
                        <span className="shrink-0 rounded bg-primary/15 px-1 text-[10px] font-bold text-primary">
                          $
                        </span>
                      )}
                    </div>
                    <div
                      className="mt-0.5 truncate pl-3.5 text-xs text-muted-foreground"
                      title={`${client?.name || 'Unknown client'}${task ? ` / ${task.name} -` : ' ›'} ${project?.name || 'Unknown project'}${presetTags.length > 0 ? ` · ${presetTags.map((t) => t.name).join(', ')}` : ''}`}
                    >
                      {client?.name || 'Unknown client'}
                      {task ? <> / {task.name} - </> : <> › </>}
                      {project?.name || 'Unknown project'}
                      {presetTags.length > 0 &&
                        ` · ${presetTags.map((t) => t.name).join(', ')}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDeletePreset(e, preset.id)}
                    aria-label={`Delete preset ${preset.name}`}
                    title="Delete preset"
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                    tabIndex={-1}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </DropdownMenuItem>
              )
            })
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={handleOpenSaveDialog}>
            <Plus className="mr-2 size-4" />
            New preset…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {saveDialogOpen && (
        <SavePresetDialog
          open={saveDialogOpen}
          onOpenChange={handleSaveDialogClose}
          workspaceId={workspaceId}
          clientId={clientId}
          projectId={projectId}
          taskId={taskId}
          tagIds={tagIds}
          billable={billable}
          clients={clients}
          projects={projects}
          projectTasks={projectTasks}
          tags={tags}
        />
      )}
    </>
  )
}
