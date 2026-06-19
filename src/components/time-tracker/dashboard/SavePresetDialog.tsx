import { useReducer } from 'react'
import { DollarSign } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
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
import { saveTimerPresetFn } from '#/lib/server/tracker'
import { trackerKeys } from '#/lib/time-tracker/query-keys'
import type { TimerPreset } from '#/lib/time-tracker/presets'
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
  taskId: string
  tagIds: string[]
  billable: boolean
  clients: Client[]
  projects: Project[]
  projectTasks: Array<{ id: string; projectId: string; name: string }>
  tags: SearchableItem[]
}

type DraftState = {
  name: string
  clientId: string
  projectId: string
  taskId: string
  tagIds: string[]
  billable: boolean
  error: string | null
  isSaving: boolean
}

type DraftAction =
  | { type: 'nameChanged'; name: string }
  | {
      type: 'selectionChanged'
      clientId: string
      projectId: string
      taskId: string
    }
  | { type: 'tagsChanged'; tagIds: string[] }
  | { type: 'billableToggled' }
  | { type: 'saveStarted' }
  | { type: 'saveFailed'; error: string }

function createInitialState(props: {
  clientId: string
  projectId: string
  taskId: string
  tagIds: string[]
  billable: boolean
}): DraftState {
  return {
    name: '',
    clientId: props.clientId,
    projectId: props.projectId,
    taskId: props.taskId,
    tagIds: props.tagIds,
    billable: props.billable,
    error: null,
    isSaving: false,
  }
}

function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case 'nameChanged':
      return { ...state, name: action.name }
    case 'selectionChanged':
      return {
        ...state,
        clientId: action.clientId,
        projectId: action.projectId,
        taskId: action.taskId,
      }
    case 'tagsChanged':
      return { ...state, tagIds: action.tagIds }
    case 'billableToggled':
      return { ...state, billable: !state.billable }
    case 'saveStarted':
      return { ...state, error: null, isSaving: true }
    case 'saveFailed':
      return { ...state, error: action.error, isSaving: false }
  }
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
  taskId,
  tagIds,
  billable,
  clients,
  projects,
  projectTasks,
  tags,
}: SavePresetDialogProps) {
  const [draft, dispatch] = useReducer(
    draftReducer,
    { clientId, projectId, taskId, tagIds, billable },
    createInitialState,
  )
  const queryClient = useQueryClient()

  const canSave =
    draft.name.trim().length > 0 && draft.clientId && draft.projectId

  async function handleSave() {
    if (!canSave) return

    dispatch({ type: 'saveStarted' })

    try {
      const created = await saveTimerPresetFn({
        data: {
          name: draft.name.trim(),
          clientId: draft.clientId,
          projectId: draft.projectId,
          taskId: draft.taskId || null,
          tagIds: draft.tagIds.filter(Boolean),
          billable: draft.billable,
        },
      })
      queryClient.setQueryData<TimerPreset[]>(
        trackerKeys.timerPresets(workspaceId),
        (old) => [...(old ?? []), created],
      )
      onOpenChange(false)
    } catch (err) {
      dispatch({
        type: 'saveFailed',
        error: err instanceof Error ? err.message : 'Failed to save preset',
      })
    }
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
              value={draft.name}
              onChange={(e) =>
                dispatch({ type: 'nameChanged', name: e.target.value })
              }
              placeholder="e.g., Morning Standup"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave()
              }}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Client / Project</Label>
            <ClientProjectPicker
              clients={clients.filter((c) => c.clientStatus === 'ACTIVE')}
              projects={projects}
              tasks={projectTasks}
              clientId={draft.clientId}
              projectId={draft.projectId}
              taskId={draft.taskId}
              onChange={(cid, pid, tid) => {
                dispatch({
                  type: 'selectionChanged',
                  clientId: cid,
                  projectId: pid,
                  taskId: tid ?? '',
                })
              }}
            />
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
            <div className="grid gap-1.5">
              <Label>Tags</Label>
              <TagPicker
                tags={tags}
                value={draft.tagIds}
                onChange={(nextTagIds) =>
                  dispatch({ type: 'tagsChanged', tagIds: nextTagIds })
                }
                onCreate={async () => {}}
                canCreate={false}
              />
            </div>
            <button
              type="button"
              onClick={() => dispatch({ type: 'billableToggled' })}
              aria-pressed={draft.billable}
              title={draft.billable ? 'Billable' : 'Non-billable'}
              className={`inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors ${
                draft.billable
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground'
              }`}
            >
              <DollarSign className="size-4" />
              Billable
            </button>
          </div>

          {draft.error && (
            <p className="m-0 text-sm font-semibold text-destructive">
              {draft.error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || draft.isSaving}>
            Save Preset
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
