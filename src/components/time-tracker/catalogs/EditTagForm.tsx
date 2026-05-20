import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from 'goey-toast'
import { updateTagFn } from '#/lib/server/tracker'
import type { TrackerState } from '#/lib/time-tracker/types'
import {
  CancelButton,
  ColorInput,
  inputClass,
  SubmitButton,
} from './CatalogFormParts'

export function EditTagForm({
  tag,
  onDone,
}: {
  tag: TrackerState['tags'][number]
  onDone: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState(tag.name)
  const [color, setColor] = useState(tag.color)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      await updateTagFn({ data: { id: tag.id, name, color } })
      await router.invalidate()
      gooeyToast.success('Tag updated')
      onDone()
    } catch (err) {
      gooeyToast.error('Could not update tag', {
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
        placeholder="Tag name"
        required
        className={inputClass}
      />
      <ColorInput value={color} onChange={setColor} />
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
