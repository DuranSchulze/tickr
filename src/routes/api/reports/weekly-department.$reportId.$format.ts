import { createFileRoute } from '@tanstack/react-router'
import {
  weeklyDepartmentReportFormat,
  weeklyDepartmentReportId,
} from '#/lib/time-tracker/weekly-department-report'

const privateHeaders = { 'Cache-Control': 'private, no-store' }

function unavailable() {
  return new Response('Report unavailable.', {
    status: 404,
    headers: privateHeaders,
  })
}

export const Route = createFileRoute(
  '/api/reports/weekly-department/$reportId/$format',
)({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = weeklyDepartmentReportId.safeParse(params.reportId)
        const format = weeklyDepartmentReportFormat.safeParse(params.format)
        if (!id.success || !format.success) return unavailable()
        const { prepareDepartmentReportDownload } =
          await import('#/lib/server/tracker/weekly-department-download.server')
        try {
          return await prepareDepartmentReportDownload(id.data, format.data)
        } catch {
          return new Response(
            'Could not prepare this report. Please try again.',
            {
              status: 503,
              headers: privateHeaders,
            },
          )
        }
      },
    },
  },
})
