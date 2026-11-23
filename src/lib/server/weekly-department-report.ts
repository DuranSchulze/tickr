import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { weeklyDepartmentReportId } from '#/lib/time-tracker/weekly-department-report'

export const getWeeklyDepartmentReportFn = createServerFn({ method: 'GET' })
  .inputValidator(weeklyDepartmentReportId)
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'private, no-store')
    const { getAccessibleDepartmentReport } =
      await import('./tracker/weekly-department-report.server')
    return getAccessibleDepartmentReport(data)
  })
