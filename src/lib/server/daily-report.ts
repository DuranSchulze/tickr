import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { dailyReportToken } from '#/lib/time-tracker/daily-report-link'

export const getDailyReportFn = createServerFn({ method: 'GET' })
  .inputValidator(dailyReportToken)
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'private, no-store')
    const { getAccessibleDailyReport } =
      await import('./tracker/daily-report-access.server')
    return getAccessibleDailyReport(data)
  })

export const getDailyReportOverviewFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  setResponseHeader('Cache-Control', 'private, no-store')
  const { getDailyReportOverview } =
    await import('./tracker/daily-report-overview.server')
  return getDailyReportOverview()
})
