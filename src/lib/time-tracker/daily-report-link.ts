import { z } from 'zod'

export type DailyReportScope = 'member' | 'department' | 'workspace'

export const dailyReportFormat = z.enum(['pdf', 'xlsx'])
export type DailyReportFormat = z.infer<typeof dailyReportFormat>

/** Signed link tokens are compact JWTs; anything else is rejected early. */
export const dailyReportToken = z
  .string()
  .min(20)
  .max(1024)
  .regex(/^[\w-]+\.[\w-]+\.[\w-]+$/)

export function dailyReportPagePath(token: string) {
  return `/daily-report?t=${encodeURIComponent(token)}`
}

export function dailyReportDownloadPath(
  token: string,
  format: DailyReportFormat,
) {
  return `/api/reports/daily/${format}?t=${encodeURIComponent(token)}`
}
