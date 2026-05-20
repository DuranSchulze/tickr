import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from 'goey-toast'
import { Pencil } from 'lucide-react'
import { updateWorkspaceSettingsFn } from '#/lib/server/tracker'
import type { Workspace } from '#/lib/time-tracker/types'
import { TimezoneSelect } from '#/components/ui/TimezoneSelect'
import { Info } from '../shared/Info'

export function WorkspaceInfoPanel({
  workspace,
  isOwner,
}: {
  workspace: Workspace
  isOwner: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(workspace.name)
  const [timezone, setTimezone] = useState(workspace.timezone)
  const [pending, setPending] = useState(false)

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      await updateWorkspaceSettingsFn({ data: { name, timezone } })
      await router.invalidate()
      gooeyToast.success('Settings saved')
      setEditing(false)
    } catch (err) {
      gooeyToast.error('Could not save settings', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      {editing ? (
        <form onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-semibold text-foreground">
            Workspace name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="h-9 rounded-lg border border-border bg-card text-foreground px-3 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-foreground">
            Timezone
            <TimezoneSelect
              value={timezone}
              onChange={setTimezone}
              className="h-9 rounded-lg border border-border bg-card text-foreground px-3 text-sm outline-none focus:border-primary"
            />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="h-9 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground"
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setName(workspace.name)
                setTimezone(workspace.timezone)
              }}
              className="h-9 rounded-lg border border-border px-4 text-sm font-semibold text-foreground hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <dl className="grid gap-4 sm:grid-cols-3">
            <Info label="Workspace" value={workspace.name} />
            <Info label="Timezone" value={workspace.timezone} />
            <Info
              label="Role model"
              value="Owner / Admin / Manager / Employee"
            />
          </dl>
          {isOwner && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-accent"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit settings
            </button>
          )}
        </>
      )}
    </section>
  )
}
