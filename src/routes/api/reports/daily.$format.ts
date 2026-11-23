import { createFileRoute } from '@tanstack/react-router'
import {
  dailyReportFormat,
  dailyReportToken,
} from '#/lib/time-tracker/daily-report-link'

const privateHeaders = { 'Cache-Control': 'private, no-store' }

export const Route = createFileRoute('/api/reports/daily/$format')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const format = dailyReportFormat.safeParse(params.format)
        const token = dailyReportToken.safeParse(
          new URL(request.url).searchParams.get('t'),
        )
        if (!format.success || !token.success) {
          return new Response('Report unavailable.', {
            status: 404,
            headers: privateHeaders,
          })
        }
        const { prepareDailyReportDownload } =
          await import('#/lib/server/tracker/daily-report-access.server')
        try {
          return await prepareDailyReportDownload(token.data, format.data)
        } catch {
          return new Response(
            'Could not prepare this report. Please try again.',
            { status: 503, headers: privateHeaders },
          )
        }
      },
    },
  },
})
