import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from 'goey-toast'
import { updateClientFn } from '#/lib/server/tracker'
import type { TrackerState } from '#/lib/time-tracker/types'
import { CancelButton, inputClass, SubmitButton } from './CatalogFormParts'

export function EditClientForm({
  client,
  onDone,
}: {
  client: TrackerState['clients'][number]
  onDone: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState(client.name)
  const [active, setActive] = useState(client.clientStatus === 'ACTIVE')
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      await updateClientFn({
        data: {
          id: client.id,
          name,
          clientStatus: active ? 'ACTIVE' : 'INACTIVE',
        },
      })
      await router.invalidate()
      gooeyToast.success('Client updated')
      onDone()
    } catch (err) {
      gooeyToast.error('Could not update client', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Client name"
        required
        className={inputClass}
      />
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-foreground">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        Active (visible in timer)
      </label>
      <div className="flex gap-2">
        <SubmitButton
          pending={pending}
          label="Save changes"
          pendingLabel="Saving..."
        />
        <CancelButton onClick={onDone} />
      </div>
    </form>
  )
}
