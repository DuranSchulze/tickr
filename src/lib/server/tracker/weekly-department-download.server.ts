import '@tanstack/react-start/server-only'
import {
  buildWeeklyDepartmentExcel,
  buildWeeklyDepartmentPdf,
  weeklyDepartmentReportFilename,
} from '#/lib/time-tracker/weekly-department-report-export'
import type { WeeklyDepartmentReportFormat } from '#/lib/time-tracker/weekly-department-report'
import {
  buildDepartmentReport,
  departmentReportRoster,
  getAccessibleDepartmentReport,
} from './weekly-department-report.server'

const privateHeaders = { 'Cache-Control': 'private, no-store' }

export async function prepareDepartmentReportDownload(
  id: string,
  format: WeeklyDepartmentReportFormat,
) {
  const availability = await getAccessibleDepartmentReport(id)
  if (availability.status !== 'available') {
    return new Response('Report unavailable.', {
      status: 404,
      headers: privateHeaders,
    })
  }
  const scope = availability.report
  const rows = await buildDepartmentReport(scope)
  if (!rows) throw new Error('Could not load department report data')
  const content =
    format === 'pdf'
      ? await buildWeeklyDepartmentPdf(scope, rows)
      : await buildWeeklyDepartmentExcel(scope, rows)
  const stillAvailable = await getAccessibleDepartmentReport(
    id,
    departmentReportRoster(rows),
  )
  if (stillAvailable.status !== 'available') {
    return new Response('Report unavailable.', {
      status: 404,
      headers: privateHeaders,
    })
  }
  return new Response(new Uint8Array(content), {
    headers: {
      ...privateHeaders,
      'Content-Type':
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${weeklyDepartmentReportFilename(scope, format)}"`,
    },
  })
}
