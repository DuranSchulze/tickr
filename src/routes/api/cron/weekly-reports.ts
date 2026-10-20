import { createFileRoute } from '@tanstack/react-router'
import { runWeeklyReports } from '#/lib/server/tracker/weekly-reports.server'

export async function handleWeeklyReportsCron(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const result = await runWeeklyReports()
    console.info('[cron/weekly-reports]', JSON.stringify(result))
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    console.error(
      '[cron/weekly-reports] Run failed; inspect queue and provider configuration.',
    )
    return Response.json(
      { error: 'Weekly report processing failed' },
      { status: 500 },
    )
  }
}
export const Route = createFileRoute('/api/cron/weekly-reports')({
  server: {
    handlers: {
      GET: ({ request }) => handleWeeklyReportsCron(request),
      POST: ({ request }) => handleWeeklyReportsCron(request),
    },
  },
})
