import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from 'goey-toast'
import { createClientFn } from '#/lib/server/tracker'
import {
  BulkNamesInput,
  FormTitle,
  inputClass,
  ModeToggle,
  SubmitButton,
} from './CatalogFormParts'
import { parseBulkNames, runBulk } from './catalog-form.utils'

export function ClientForm({ onSuccess }: { onSuccess?: () => void }) {
  const router = useRouter()
  const [mode, setMode] = useState<'single' | 'bulk'>('single')
  const [name, setName] = useState('')
  const [bulkNames, setBulkNames] = useState('')
  const [active, setActive] = useState(true)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      const status = active ? 'ACTIVE' : 'INACTIVE'
      if (mode === 'single') {
        await createClientFn({ data: { name, clientStatus: status } })
        await router.invalidate()
        gooeyToast.success('Client created')
        setName('')
        setActive(true)
        onSuccess?.()
      } else {
        const names = parseBulkNames(bulkNames)
        await runBulk(
          names,
          (n) => createClientFn({ data: { name: n, clientStatus: status } }),
          'client',
          router,
          onSuccess,
        )
        setBulkNames('')
      }
    } catch (err) {
      gooeyToast.error('Could not create client', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <FormTitle
        title={mode === 'single' ? 'Create client' : 'Bulk create clients'}
      />
      <ModeToggle mode={mode} onChange={setMode} />
      {mode === 'single' ? (
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Client name"
          required
          className={inputClass}
        />
      ) : (
        <BulkNamesInput value={bulkNames} onChange={setBulkNames} />
      )}
      <label className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
        />
        Active (visible in timer)
      </label>
      <SubmitButton
        pending={pending}
        label={mode === 'single' ? 'Create client' : 'Create clients'}
      />
    </form>
  )
}
