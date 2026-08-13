import { useReducer } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from '#/lib/toast'
import {
  BulkNamesInput,
  catalogFormClass,
  ColorInput,
  FormTitle,
  inputClass,
  ModeToggle,
  SubmitButton,
} from './CatalogFormParts'
import { parseBulkNames, runBulk } from './catalog-form.utils'
import { useTaskSyncPublisher } from '../TaskSyncCoordinator'

type ColorCatalogFormState = {
  mode: 'single' | 'bulk'
  name: string
  bulkNames: string
  color: string
  pending: boolean
}

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
  const publishTaskChange = useTaskSyncPublisher()
  const [state, dispatch] = useReducer(
    (s: ColorCatalogFormState, a: Partial<ColorCatalogFormState>) => ({
      ...s,
      ...a,
    }),
    {
      mode: 'single' as const,
      name: '',
      bulkNames: '',
      color: defaultColor,
      pending: false,
    },
  )
  const { mode, name, bulkNames, color, pending } = state

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    dispatch({ pending: true })
    try {
      if (mode === 'single') {
        await onCreate({ name, color })
        await router.invalidate()
        gooeyToast.success(`${title} created`)
        dispatch({ name: '', color: defaultColor })
        publishTaskChange()
        onSuccess?.()
      } else {
        const names = parseBulkNames(bulkNames)
        await runBulk(
          names,
          (n) => onCreate({ name: n, color }),
          title.toLowerCase(),
          router,
          () => {
            publishTaskChange()
            onSuccess?.()
          },
        )
        dispatch({ bulkNames: '' })
      }
    } catch (err) {
      gooeyToast.error(`Could not create ${title.toLowerCase()}`, {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      dispatch({ pending: false })
    }
  }

  return (
    <form onSubmit={handleSubmit} className={catalogFormClass}>
      <FormTitle
        title={
          mode === 'single'
            ? `Create ${title.toLowerCase()}`
            : `Bulk create ${title.toLowerCase()}s`
        }
      />
      <ModeToggle mode={mode} onChange={(m) => dispatch({ mode: m })} />
      {mode === 'single' ? (
        <input
          value={name}
          onChange={(event) => dispatch({ name: event.target.value })}
          placeholder={placeholder}
          aria-label={placeholder}
          required
          className={inputClass}
        />
      ) : (
        <BulkNamesInput
          value={bulkNames}
          onChange={(v) => dispatch({ bulkNames: v })}
        />
      )}
      <ColorInput value={color} onChange={(c) => dispatch({ color: c })} />
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
