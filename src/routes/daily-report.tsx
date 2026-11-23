import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { Button } from '#/components/ui/button'
import { Card } from '#/components/ui/card'
import { getDailyReportFn } from '#/lib/server/daily-report'
import {
  dailyReportDownloadPath,
  dailyReportToken,
} from '#/lib/time-tracker/daily-report-link'

type DailyReportSearch = { t?: string }

const SCOPE_LABELS = {
  member: 'Personal daily report',
  department: 'Department daily report',
  workspace: 'Workspace daily report',
} as const

export const Route = createFileRoute('/daily-report')({
  validateSearch: (search: Record<string, unknown>): DailyReportSearch => ({
    t: dailyReportToken.safeParse(search.t).data,
  }),
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  staleTime: 0,
  loaderDeps: ({ search }) => ({ token: search.t }),
  loader: async ({ deps }) => {
    if (!deps.token) return null
    const result = await getDailyReportFn({ data: deps.token })
    if (result.status === 'signed_out') {
      throw redirect({ to: '/auth', search: { dailyReport: deps.token } })
    }
    return result.status === 'available'
      ? { report: result.report, token: deps.token }
      : null
  },
  component: DailyReportPage,
})

function DailyReportPage() {
  const data = Route.useLoaderData()
  return (
    <main className="min-h-screen bg-background px-4 py-12 text-foreground">
      <Card className="mx-auto flex max-w-xl flex-col gap-5 p-6 sm:p-8">
        <Link
          to="/app/time-tracker"
          className="w-fit text-sm font-medium text-primary"
        >
          Back to Trackly
        </Link>
        {data ? (
          <>
            <div>
              <p className="text-sm text-muted-foreground">
                {data.report.workspaceName} · {SCOPE_LABELS[data.report.scope]}
              </p>
              <h1 className="text-2xl font-semibold">{data.report.title}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {data.report.dateLabel} ({data.report.timezone})
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <a href={dailyReportDownloadPath(data.token, 'pdf')}>
                  Download PDF
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href={dailyReportDownloadPath(data.token, 'xlsx')}>
                  Download Excel
                </a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Files are built from current data, so entries added or corrected
              after the email was sent are included.
            </p>
          </>
        ) : (
          <div>
            <h1 className="text-2xl font-semibold">Report unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This link may have expired or your account may no longer have
              access to this report.
            </p>
          </div>
        )}
      </Card>
    </main>
  )
}
