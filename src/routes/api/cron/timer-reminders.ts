import { createFileRoute } from '@tanstack/react-router'
import { sendLateTimerReminders } from '#/lib/server/tracker/timer-reminders.server'

async function handleTimerRemindersCron(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const result = await sendLateTimerReminders()
  console.log(
    `[cron/timer-reminders] Done. checked=${result.checked} due=${result.due} sent=${result.sent} skipped=${result.skippedAlreadySent} failures=${result.failureCount} duration=${result.durationMs}ms`,
  )

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export const Route = createFileRoute('/api/cron/timer-reminders')({
  server: {
    handlers: {
      GET: async ({ request }) => handleTimerRemindersCron(request),
      POST: async ({ request }) => handleTimerRemindersCron(request),
    },
  },
})
