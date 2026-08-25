import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { getAuditLogsFn } from '#/lib/server/tracker'
import { fetchFreshWorkspaceAuthorization } from '#/lib/time-tracker/workspace-authorization'
import { AuditLogsScreen } from '#/components/time-tracker/screens/AuditLogsScreen/AuditLogsScreen'

const auditLogsSearchSchema = z.object({
  action: z.string().optional(),
  actorEmail: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  page: z.number().optional(),
})

export const Route = createFileRoute('/app/audit-logs')({
  validateSearch: auditLogsSearchSchema,
  loaderDeps: ({ search }) => search,
  beforeLoad: async ({ context }) => {
    const access = await fetchFreshWorkspaceAuthorization(context.queryClient)
    if (!access.member.permissions['audit_logs.view']) {
      throw redirect({ to: '/app/time-tracker' })
    }
  },
  loader: async ({ deps }) => {
    return getAuditLogsFn({ data: deps })
  },
  staleTime: 15_000,
  component: AuditLogsRoute,
})

// oxlint-disable-next-line react/only-export-components
function AuditLogsRoute() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  return <AuditLogsScreen result={data} filters={search} />
}
