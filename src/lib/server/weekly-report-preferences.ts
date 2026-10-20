import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export const getWeeklyReportPreferencesFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { getWeeklyReportPreferences } =
    await import('./weekly-report-preferences.server')
  return getWeeklyReportPreferences()
})
export const updateWeeklyReportPreferencesFn = createServerFn({
  method: 'POST',
})
  .inputValidator(z.strictObject({ enabled: z.boolean() }))
  .handler(async ({ data }) => {
    const { updateWeeklyReportPreferences } =
      await import('./weekly-report-preferences.server')
    return updateWeeklyReportPreferences(data.enabled)
  })
