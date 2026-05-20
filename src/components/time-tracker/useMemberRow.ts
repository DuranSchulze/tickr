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

export function useMemberRow(member: Member) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
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

  function resetEditState() {
    setRoleId(member.workspaceRoleId)
    setDeptId(member.departmentId)
    setCohortIds(member.cohortIds)
    setRate(member.billableRate == null ? '' : String(member.billableRate))
    setEditing(false)
  }

  async function handleSave() {
    if (rateInputInvalid) {
      gooeyToast.error('Enter a valid hourly rate', {
        description: 'Use a positive number, or leave it blank for default.',
      })
      return
    }
    setPending(true)
    try {
      await Promise.all([
        updateWorkspaceMemberFn({
          data: {
            memberId: member.id,
            workspaceRoleId: roleId || undefined,
            departmentId: deptId || undefined,
            cohortIds,
          },
        }),
        updateMemberBillableRateFn({
          data: { memberId: member.id, billableRate: parsedRate },
        }),
      ])
      await router.invalidate()
      setRate(parsedRate == null ? '' : String(parsedRate))
      gooeyToast.success('Member updated')
      setEditing(false)
    } catch (err) {
      gooeyToast.error('Could not update member', {
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
    editing,
    setEditing,
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
    resetEditState,
    handleSave,
    handleToggleStatus,
    toggleCohort,
  }
}
