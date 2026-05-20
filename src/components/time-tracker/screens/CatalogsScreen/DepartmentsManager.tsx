import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from 'goey-toast'
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
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [pending, setPending] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      await createDepartmentFn({
        data: { name, description: description || undefined, color },
      })
      await router.invalidate()
      gooeyToast.success('Department created')
      setName('')
      setDescription('')
      setColor('#6366f1')
      setShowForm(false)
    } catch (err) {
      gooeyToast.error('Could not create department', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  async function handleDelete(id: string, deptName: string) {
    setDeletingId(id)
    try {
      await deleteDepartmentFn({ data: { id } })
      await router.invalidate()
      gooeyToast.success(`"${deptName}" deleted`)
    } catch (err) {
      gooeyToast.error('Could not delete department', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <SectionCard
      title="Departments"
      action={
        canManage ? (
          <button
            type="button"
            onClick={() => setShowForm((p) => !p)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-colors hover:brightness-110"
          >
            {showForm ? (
              <X className="h-3.5 w-3.5" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
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
              onChange={(e) => setName(e.target.value)}
              placeholder="Department name"
              required
              className="h-9 flex-1 rounded-lg border border-border bg-card text-foreground px-3 text-sm outline-none focus:border-primary"
            />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-12 cursor-pointer rounded-lg border border-border p-1"
              title="Department color"
            />
          </div>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
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
                  className={`h-3.5 w-3.5 opacity-0 group-hover:opacity-100 ${deletingId === dept.id ? 'opacity-100' : ''}`}
                />
              </IconBtn>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  )
}
