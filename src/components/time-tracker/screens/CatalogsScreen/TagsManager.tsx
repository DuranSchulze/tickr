import { useReducer } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from '#/lib/toast'
import { Plus, Trash2, X } from 'lucide-react'
import { archiveTagFn, createTagFn } from '#/lib/server/tracker'
import type { TrackerState } from '#/lib/time-tracker/types'
import { IconBtn } from '../shared/IconBtn'
import { SectionCard } from '../shared/SectionCard'

export function TagsManager({
  state,
  canManage,
}: {
  state: TrackerState
  canManage: boolean
}) {
  const router = useRouter()
  const [local, dispatch] = useReducer(
    (
      s: {
        showForm: boolean
        name: string
        color: string
        pending: boolean
        archivingId: string | null
      },
      a: Partial<typeof s>,
    ) => ({ ...s, ...a }),
    {
      showForm: false,
      name: '',
      color: '#14b8a6',
      pending: false,
      archivingId: null,
    },
  )
  const { showForm, name, color, pending, archivingId } = local

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    dispatch({ pending: true })
    try {
      await createTagFn({ data: { name, color } })
      await router.invalidate()
      gooeyToast.success('Tag created')
      dispatch({ name: '', color: '#14b8a6', showForm: false })
    } catch (err) {
      gooeyToast.error('Could not create tag', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      dispatch({ pending: false })
    }
  }

  async function handleArchive(id: string, tagName: string) {
    dispatch({ archivingId: id })
    try {
      await archiveTagFn({ data: { id } })
      await router.invalidate()
      gooeyToast.success(`"${tagName}" archived`)
    } catch (err) {
      gooeyToast.error('Could not archive tag', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      dispatch({ archivingId: null })
    }
  }

  return (
    <SectionCard
      title="Tags"
      action={
        canManage ? (
          <button
            type="button"
            onClick={() => dispatch({ showForm: !showForm })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-colors hover:brightness-110"
          >
            {showForm ? (
              <X className="size-3.5" />
            ) : (
              <Plus className="size-3.5" />
            )}
            {showForm ? 'Cancel' : 'New tag'}
          </button>
        ) : undefined
      }
    >
      {showForm && (
        <form onSubmit={handleCreate} className="mt-4 flex gap-2">
          <input
            value={name}
            onChange={(e) => dispatch({ name: e.target.value })}
            placeholder="Tag name"
            aria-label="Tag name"
            required
            className="h-9 flex-1 rounded-lg border border-border bg-card text-foreground px-3 text-sm outline-none focus:border-primary"
          />
          <input
            type="color"
            value={color}
            onChange={(e) => dispatch({ color: e.target.value })}
            className="h-9 w-12 cursor-pointer rounded-lg border border-border p-1"
            title="Tag color"
            aria-label="Tag color"
          />
          <button
            type="submit"
            disabled={pending}
            className="h-9 rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground"
          >
            {pending ? '…' : 'Add'}
          </button>
        </form>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {state.tags.map((t) => (
          <div
            key={t.id}
            className="group flex items-center gap-1.5 rounded-lg border border-border px-3 py-2"
          >
            <span
              className="inline-block size-2.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: t.color }}
            />
            <span className="text-sm font-semibold text-foreground">
              {t.name}
            </span>
            {canManage && (
              <IconBtn
                onClick={() => handleArchive(t.id, t.name)}
                title="Archive tag"
                variant="danger"
              >
                <Trash2
                  className={`size-3 opacity-0 group-hover:opacity-100 ${archivingId === t.id ? 'opacity-100' : ''}`}
                />
              </IconBtn>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  )
}
