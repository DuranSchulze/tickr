import { z } from 'zod'

export const weeklyDepartmentReportId = z.uuid()
export const weeklyDepartmentReportFormat = z.enum(['pdf', 'xlsx'])
export type WeeklyDepartmentReportFormat = z.infer<
  typeof weeklyDepartmentReportFormat
>

export function weeklyDepartmentReportPath(id: string) {
  return `/weekly-department-report/${encodeURIComponent(id)}`
}

export type DepartmentReportScope = {
  id: string
  workspace_id: string
  workspace_name: string
  department_id: string
  department_name: string
  week_start: string
  week_end: string
  timezone: string
}

export type DepartmentReportRow = {
  member_id: string
  assignment_start: string
  member: string
  local_date: string
  time_in: string | null
  time_out: string | null
  worked_seconds: number
  billable_seconds: number
  status: 'WORK' | 'N/A' | 'NO_TIME' | 'OUT_OF_SCOPE'
}
