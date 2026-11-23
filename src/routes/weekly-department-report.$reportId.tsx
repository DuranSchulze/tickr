import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { Button } from '#/components/ui/button'
import { Card } from '#/components/ui/card'
import { getWeeklyDepartmentReportFn } from '#/lib/server/weekly-department-report'
import { weeklyDepartmentReportId } from '#/lib/time-tracker/weekly-department-report'

export const Route = createFileRoute('/weekly-department-report/$reportId')({
  staleTime: 0,
  loader: async ({ params }) => {
    const parsed = weeklyDepartmentReportId.safeParse(params.reportId)
    if (!parsed.success) return null
    const result = await getWeeklyDepartmentReportFn({ data: parsed.data })
    if (result.status === 'signed_out') {
      throw redirect({ to: '/auth', search: { weeklyReport: parsed.data } })
    }
    return result.status === 'available' ? result.report : null
  },
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  component: WeeklyDepartmentReportPage,
})

function WeeklyDepartmentReportPage() {
  const report = Route.useLoaderData()
  const downloadPath = report
    ? `/api/reports/weekly-department/${report.id}`
    : ''
  return (
    <main className="min-h-screen bg-background px-4 py-12 text-foreground">
      <Card className="mx-auto flex max-w-xl flex-col gap-5 p-6 sm:p-8">
        <Link
          to="/app/time-tracker"
          className="w-fit text-sm font-medium text-primary"
        >
          Back to Trackly
        </Link>
        {report ? (
          <>
            <div>
              <p className="text-sm text-muted-foreground">
                {report.workspace_name}
              </p>
              <h1 className="text-2xl font-semibold">
                {report.department_name} weekly report
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {report.week_start} to {report.week_end} ({report.timezone})
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <a href={`${downloadPath}/pdf`}>Download PDF</a>
              </Button>
              <Button asChild variant="outline">
                <a href={`${downloadPath}/xlsx`}>Download Excel</a>
              </Button>
            </div>
          </>
        ) : (
          <div>
            <h1 className="text-2xl font-semibold">Report unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This report may have expired or your account may no longer have
              access.
            </p>
          </div>
        )}
      </Card>
    </main>
  )
}
