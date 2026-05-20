import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from 'goey-toast'
import { createDepartmentFn } from '#/lib/server/tracker'
import {
  BulkNamesInput,
  ColorInput,
  FormTitle,
  inputClass,
  ModeToggle,
  SubmitButton,
} from './CatalogFormParts'
import { parseBulkNames, runBulk } from './catalog-form.utils'

export function DepartmentForm({ onSuccess }: { onSuccess?: () => void }) {
  const router = useRouter()
  const [mode, setMode] = useState<'single' | 'bulk'>('single')
  const [name, setName] = useState('')
  const [bulkNames, setBulkNames] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      if (mode === 'single') {
        await createDepartmentFn({
          data: { name, description: description || undefined, color },
        })
        await router.invalidate()
        gooeyToast.success('Department created')
        setName('')
        setDescription('')
        setColor('#6366f1')
        onSuccess?.()
      } else {
        const names = parseBulkNames(bulkNames)
        await runBulk(
          names,
          (n) => createDepartmentFn({ data: { name: n, color } }),
          'department',
          router,
          onSuccess,
        )
        setBulkNames('')
      }
    } catch (err) {
      gooeyToast.error('Could not create department', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <FormTitle
        title={
          mode === 'single' ? 'Create department' : 'Bulk create departments'
        }
      />
      <ModeToggle mode={mode} onChange={setMode} />
      {mode === 'single' ? (
        <>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Department name"
            required
            className={inputClass}
          />
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description"
            className={inputClass}
          />
        </>
      ) : (
        <BulkNamesInput value={bulkNames} onChange={setBulkNames} />
      )}
      <ColorInput value={color} onChange={setColor} />
      <SubmitButton
        pending={pending}
        label={mode === 'single' ? 'Create department' : 'Create departments'}
      />
    </form>
  )
}
