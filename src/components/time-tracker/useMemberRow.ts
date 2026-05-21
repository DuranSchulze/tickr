import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from 'goey-toast'
import {
  setMemberStatusFn,
  updateMemberBillableRateFn,
  updateWorkspaceMemberFn,
} from '#/lib/server/tracker'
import type { TrackerState } from '#/lib/time-tracker/types'

type Member = TrackerState['members'][number]
export type EditingField = 'role' | 'dept' | 'cohorts' | 'rate' | null

export function useMemberRow(member: Member) {
  const router = useRouter()
  const [editingField, setEditingField] = useState<EditingField>(null)
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [roleId, setRoleId] = useState(member.workspaceRoleId)
  const [deptId, setDeptId] = useState(member.departmentId)
  const [cohortIds, setCohortIds] = useState<string[]>(member.cohortIds)
  const [rate, setRate] = useState(
    member.billableRate == null ? '' : String(member.billableRate),
  )
  const [pending, setPending] = useState(false)

  const rateInput = rate.trim()
  const parsedRate = rateInput === '' ? null : Number(rateInput)
  const rateInputInvalid =
    parsedRate !== null && (!Number.isFinite(parsedRate) || parsedRate < 0)

  function cancelEdit() {
    setRoleId(member.workspaceRoleId)
    setDeptId(member.departmentId)
    setCohortIds(member.cohortIds)
    setRate(member.billableRate == null ? '' : String(member.billableRate))
    setEditingField(null)
  }

  async function saveMemberFields(fields: {
    roleId?: string
    deptId?: string
    cohortIds?: string[]
  }) {
    setPending(true)
    try {
      await updateWorkspaceMemberFn({
        data: {
          memberId: member.id,
          workspaceRoleId: (fields.roleId ?? roleId) || undefined,
          departmentId: (fields.deptId ?? deptId) || undefined,
          cohortIds: fields.cohortIds ?? cohortIds,
        },
      })
      await router.invalidate()
      gooeyToast.success('Member updated')
    } catch (err) {
      gooeyToast.error('Could not update member', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  async function saveRate() {
    const currentRate =
      member.billableRate == null ? '' : String(member.billableRate)
    if (rate.trim() === currentRate) return
    if (rateInputInvalid) {
      gooeyToast.error('Enter a valid hourly rate', {
        description: 'Use a positive number, or leave it blank for default.',
      })
      return
    }
    setPending(true)
    try {
      await updateMemberBillableRateFn({
        data: { memberId: member.id, billableRate: parsedRate },
      })
      await router.invalidate()
      gooeyToast.success('Rate updated')
    } catch (err) {
      gooeyToast.error('Could not update rate', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  async function handleToggleStatus() {
    const next = member.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED'
    setPending(true)
    try {
      await setMemberStatusFn({ data: { memberId: member.id, status: next } })
      await router.invalidate()
      gooeyToast.success(
        `Member ${next === 'DISABLED' ? 'disabled' : 'reactivated'}`,
      )
    } catch (err) {
      gooeyToast.error('Could not update status', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  function toggleCohort(id: string) {
    setCohortIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    )
  }

  return {
    editingField,
    setEditingField,
    showAnalytics,
    setShowAnalytics,
    roleId,
    setRoleId,
    deptId,
    setDeptId,
    cohortIds,
    setCohortIds,
    rate,
    setRate,
    pending,
    parsedRate,
    rateInputInvalid,
    cancelEdit,
    saveMemberFields,
    saveRate,
    handleToggleStatus,
    toggleCohort,
  }
}
