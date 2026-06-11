import { useReducer } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from '#/lib/toast'
import { Plus, Trash2, X } from 'lucide-react'
import { createDepartmentFn, deleteDepartmentFn } from '#/lib/server/tracker'
import type { TrackerState } from '#/lib/time-tracker/types'
import { IconBtn } from '../shared/IconBtn'
import { SectionCard } from '../shared/SectionCard'

export function DepartmentsManager({
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
        description: string
        color: string
        pending: boolean
        deletingId: string | null
      },
      a: Partial<typeof s>,
    ) => ({ ...s, ...a }),
    {
      showForm: false,
      name: '',
      description: '',
      color: '#6366f1',
      pending: false,
      deletingId: null,
    },
  )
  const { showForm, name, description, color, pending, deletingId } = local

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    dispatch({ pending: true })
    try {
      await createDepartmentFn({
        data: { name, description: description || undefined, color },
      })
      await router.invalidate()
      gooeyToast.success('Department created')
      dispatch({ name: '', description: '', color: '#6366f1', showForm: false })
    } catch (err) {
      gooeyToast.error('Could not create department', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      dispatch({ pending: false })
    }
  }

  async function handleDelete(id: string, deptName: string) {
    dispatch({ deletingId: id })
    try {
      await deleteDepartmentFn({ data: { id } })
      await router.invalidate()
      gooeyToast.success(`"${deptName}" deleted`)
    } catch (err) {
      gooeyToast.error('Could not delete department', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      dispatch({ deletingId: null })
    }
  }

  return (
    <SectionCard
      title="Departments"
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
            {showForm ? 'Cancel' : 'New department'}
          </button>
        ) : undefined
      }
    >
      {showForm && (
        <form onSubmit={handleCreate} className="mt-4 grid gap-2">
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => dispatch({ name: e.target.value })}
              placeholder="Department name"
              aria-label="Department name"
              required
              className="h-9 flex-1 rounded-lg border border-border bg-card text-foreground px-3 text-sm outline-none focus:border-primary"
            />
            <input
              type="color"
              value={color}
              onChange={(e) => dispatch({ color: e.target.value })}
              className="h-9 w-12 cursor-pointer rounded-lg border border-border p-1"
              title="Department color"
              aria-label="Department color"
            />
          </div>
          <input
            value={description}
            onChange={(e) => dispatch({ description: e.target.value })}
            placeholder="Description (optional)"
            aria-label="Description"
            className="h-9 rounded-lg border border-border bg-card text-foreground px-3 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={pending}
            className="h-9 rounded-lg bg-primary text-sm font-bold text-primary-foreground hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground"
          >
            {pending ? 'Creating…' : 'Create department'}
          </button>
        </form>
      )}
      <div className="mt-4 flex flex-col gap-2">
        {state.departments.map((dept) => (
          <div
            key={dept.id}
            className="group flex items-center justify-between rounded-lg border border-border px-3 py-2"
          >
            <span className="text-sm font-semibold text-foreground">
              {dept.name}
            </span>
            {canManage && (
              <IconBtn
                onClick={() => handleDelete(dept.id, dept.name)}
                title="Delete department"
                variant="danger"
              >
                <Trash2
                  className={`size-3.5 opacity-0 group-hover:opacity-100 ${deletingId === dept.id ? 'opacity-100' : ''}`}
                />
              </IconBtn>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  )
}
