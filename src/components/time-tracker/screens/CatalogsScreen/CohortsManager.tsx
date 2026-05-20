import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from 'goey-toast'
import { Plus, Trash2, X } from 'lucide-react'
import { createCohortFn, deleteCohortFn } from '#/lib/server/tracker'
import type { TrackerState } from '#/lib/time-tracker/types'
import { IconBtn } from '../shared/IconBtn'
import { SectionCard } from '../shared/SectionCard'

export function CohortsManager({
  state,
  canManage,
}: {
  state: TrackerState
  canManage: boolean
}) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [departmentId, setDepartmentId] = useState(
    state.departments[0]?.id ?? '',
  )
  const [filterDepartmentId, setFilterDepartmentId] = useState('')
  const [pending, setPending] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const visibleCohorts = state.cohorts.filter(
    (cohort) =>
      !filterDepartmentId || cohort.departmentId === filterDepartmentId,
  )

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    if (!departmentId) {
      gooeyToast.error('Select a department first')
      return
    }
    setPending(true)
    try {
      await createCohortFn({ data: { name, departmentId } })
      await router.invalidate()
      gooeyToast.success('Cohort created')
      setName('')
      setShowForm(false)
    } catch (err) {
      gooeyToast.error('Could not create cohort', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  async function handleDelete(id: string, cohortName: string) {
    setDeletingId(id)
    try {
      await deleteCohortFn({ data: { id } })
      await router.invalidate()
      gooeyToast.success(`"${cohortName}" deleted`)
    } catch (err) {
      gooeyToast.error('Could not delete cohort', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <SectionCard
      title="Groups / cohorts"
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
            {showForm ? 'Cancel' : 'New cohort'}
          </button>
        ) : undefined
      }
    >
      {showForm && (
        <form onSubmit={handleCreate} className="mt-4 grid gap-2">
          <select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            required
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="">Choose department</option>
            {state.departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Cohort name"
            required
            className="h-9 rounded-lg border border-border bg-card text-foreground px-3 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={pending}
            className="h-9 rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground"
          >
            {pending ? 'Creating…' : 'Create cohort'}
          </button>
        </form>
      )}
      <div className="mt-4">
        <select
          value={filterDepartmentId}
          onChange={(e) => setFilterDepartmentId(e.target.value)}
          className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="">All departments</option>
          {state.departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {visibleCohorts.map((cohort) => {
          const department = state.departments.find(
            (dept) => dept.id === cohort.departmentId,
          )

          return (
            <div
              key={cohort.id}
              className="group flex items-center justify-between rounded-lg border border-border px-3 py-2"
            >
              <div>
                <p className="m-0 text-sm font-semibold text-foreground">
                  {cohort.name}
                </p>
                <p className="m-0 mt-0.5 text-xs text-muted-foreground">
                  {department?.name ?? 'Unassigned department'}
                </p>
              </div>
              {canManage && (
                <IconBtn
                  onClick={() => handleDelete(cohort.id, cohort.name)}
                  title="Delete cohort"
                  variant="danger"
                >
                  <Trash2
                    className={`h-3.5 w-3.5 opacity-0 group-hover:opacity-100 ${deletingId === cohort.id ? 'opacity-100' : ''}`}
                  />
                </IconBtn>
              )}
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}
