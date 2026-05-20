import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from 'goey-toast'
import {
  BulkNamesInput,
  ColorInput,
  FormTitle,
  inputClass,
  ModeToggle,
  SubmitButton,
} from './CatalogFormParts'
import { parseBulkNames, runBulk } from './catalog-form.utils'

export function ColorCatalogForm({
  title,
  placeholder,
  defaultColor,
  onCreate,
  onSuccess,
}: {
  title: string
  placeholder: string
  defaultColor: string
  onCreate: (data: { name: string; color: string }) => Promise<void>
  onSuccess?: () => void
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'single' | 'bulk'>('single')
  const [name, setName] = useState('')
  const [bulkNames, setBulkNames] = useState('')
  const [color, setColor] = useState(defaultColor)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      if (mode === 'single') {
        await onCreate({ name, color })
        await router.invalidate()
        gooeyToast.success(`${title} created`)
        setName('')
        setColor(defaultColor)
        onSuccess?.()
      } else {
        const names = parseBulkNames(bulkNames)
        await runBulk(
          names,
          (n) => onCreate({ name: n, color }),
          title.toLowerCase(),
          router,
          onSuccess,
        )
        setBulkNames('')
      }
    } catch (err) {
      gooeyToast.error(`Could not create ${title.toLowerCase()}`, {
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
          mode === 'single'
            ? `Create ${title.toLowerCase()}`
            : `Bulk create ${title.toLowerCase()}s`
        }
      />
      <ModeToggle mode={mode} onChange={setMode} />
      {mode === 'single' ? (
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={placeholder}
          required
          className={inputClass}
        />
      ) : (
        <BulkNamesInput value={bulkNames} onChange={setBulkNames} />
      )}
      <ColorInput value={color} onChange={setColor} />
      <SubmitButton
        pending={pending}
        label={
          mode === 'single'
            ? `Create ${title.toLowerCase()}`
            : `Create ${title.toLowerCase()}s`
        }
      />
    </form>
  )
}
