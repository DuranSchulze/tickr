import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { getAuditLogsFn } from '#/lib/server/tracker'
import { getWorkspaceAccessFn } from '#/lib/server/workspace-access'
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
    const access = await context.queryClient.ensureQueryData({
      queryKey: ['workspace-access'],
      queryFn: () => getWorkspaceAccessFn(),
      staleTime: 5 * 60 * 1000,
    })
    const level = access.member.permissionLevel
    if (level !== 'OWNER' && level !== 'ADMIN') {
      throw redirect({ to: '/app/time-tracker' })
    }
  },
  loader: async ({ deps }) => {
    return getAuditLogsFn({ data: deps })
  },
  staleTime: 15_000,
  component: AuditLogsRoute,
})

function AuditLogsRoute() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  return <AuditLogsScreen result={data} filters={search} />
}
