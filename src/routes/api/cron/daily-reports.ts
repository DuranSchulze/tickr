import { createFileRoute } from '@tanstack/react-router'
import { runDailyReports } from '#/lib/server/tracker/daily-reports.server'

export async function handleDailyReportsCron(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  try {
    const result = await runDailyReports()
    console.info('[cron/daily-reports]', JSON.stringify(result))
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error(
      '[cron/daily-reports] Run failed; check RESEND_API_KEY and APP_URL.',
      error instanceof Error ? error.message : error,
    )
    return Response.json(
      { error: 'Daily report processing failed' },
      { status: 500 },
    )
  }
}

export const Route = createFileRoute('/api/cron/daily-reports')({
  server: {
    handlers: {
      GET: ({ request }) => handleDailyReportsCron(request),
      POST: ({ request }) => handleDailyReportsCron(request),
    },
  },
})
