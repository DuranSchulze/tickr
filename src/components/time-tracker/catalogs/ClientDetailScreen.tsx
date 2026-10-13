import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { formatCurrency } from '#/lib/time-tracker/billing'
import { formatHours } from '#/lib/time-tracker/store'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { SectionCard } from '../screens/shared/SectionCard'
import type { ClientDetail } from '#/lib/server/tracker/catalogs/client-detail.server'

const STATUS_STYLES = {
  ACTIVE: { label: 'Active', className: 'bg-emerald-500/10 text-emerald-700' },
  SUSPENDED: {
    label: 'Suspended',
    className: 'bg-amber-500/10 text-amber-700',
  },
  INACTIVE: { label: 'Inactive', className: 'bg-stone text-graphite' },
} as const

function StatusBadge({
  status,
}: {
  status: ClientDetail['client']['clientStatus']
}) {
  const { label, className } = STATUS_STYLES[status]
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-smoke">
        {label}
      </span>
      <span className="text-xl font-bold tabular-nums text-foreground">
        {value}
      </span>
    </div>
  )
}

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        className="py-6 text-center text-sm text-smoke"
      >
        {message}
      </TableCell>
    </TableRow>
  )
}

export function ClientDetailScreen({
  detail,
  canViewBillable,
  currency,
}: {
  detail: ClientDetail | null
  canViewBillable: boolean
  currency: string
}) {
  const backLink = (
    <Link
      to="/app/workspace/catalogs/clients"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-smoke hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" />
      All clients
    </Link>
  )

  if (!detail) {
    return (
      <div className="grid min-w-0 gap-6">
        {backLink}
        <SectionCard title="Client not found">
          <p className="m-0 mt-4 text-sm text-smoke">
            This client doesn&apos;t exist or may have been removed.
          </p>
        </SectionCard>
      </div>
    )
  }

  const { client, projects, tasks, tags } = detail

  return (
    <div className="grid min-w-0 gap-6">
      <header>
        {backLink}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="m-0 text-2xl font-bold tracking-tight text-foreground">
            {client.name}
          </h1>
          <StatusBadge status={client.clientStatus} />
        </div>
        <p className="m-0 mt-1 text-sm text-smoke">
          {client.projectCount} project{client.projectCount === 1 ? '' : 's'} ·{' '}
          {client.activeMembersCount} active member
          {client.activeMembersCount === 1 ? '' : 's'}
          {canViewBillable && client.defaultBillableRate != null
            ? ` · default rate ${formatCurrency(client.defaultBillableRate, currency)}`
            : ''}
        </p>
      </header>

      <SectionCard title="Overview">
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Total hours" value={formatHours(client.totalSeconds)} />
          {canViewBillable && (
            <Stat
              label="Billable amount"
              value={formatCurrency(client.billableAmount, currency)}
            />
          )}
          <Stat label="Active members" value={client.activeMembersCount} />
          <Stat label="Projects" value={client.projectCount} />
          <Stat label="Tasks" value={client.taskCount} />
          <Stat label="Tags used" value={client.tagCount} />
        </div>
      </SectionCard>

      <SectionCard title="Projects">
        <div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Tasks</TableHead>
                <TableHead className="text-right">Total hours</TableHead>
                {canViewBillable && (
                  <TableHead className="text-right">Billable amount</TableHead>
                )}
                <TableHead className="text-right">Members</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.length === 0 && (
                <EmptyRow
                  colSpan={canViewBillable ? 6 : 5}
                  message="No projects yet. Add a project under this client from the Projects catalog."
                />
              )}
              {projects.map((project) => (
                <TableRow key={project.id}>
                  <TableCell>
                    <span className="inline-flex items-center gap-2 font-semibold text-foreground">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: project.color }}
                      />
                      {project.name}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-smoke">
                    {project.archived ? 'Archived' : 'Active'}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-smoke">
                    {project.taskCount}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-smoke">
                    {formatHours(project.totalSeconds)}
                  </TableCell>
                  {canViewBillable && (
                    <TableCell className="text-right text-sm tabular-nums text-smoke">
                      {formatCurrency(project.billableAmount, currency)}
                    </TableCell>
                  )}
                  <TableCell className="text-right text-sm tabular-nums text-smoke">
                    {project.activeMembersCount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      <SectionCard title="Tasks">
        <div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.length === 0 && (
                <EmptyRow
                  colSpan={3}
                  message="No tasks yet. Tasks live under a project."
                />
              )}
              {tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="font-medium text-foreground">
                    {task.name}
                  </TableCell>
                  <TableCell className="text-sm text-smoke">
                    {task.projectName}
                  </TableCell>
                  <TableCell className="text-sm text-smoke">
                    {task.archived ? 'Archived' : 'Active'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      <SectionCard title="Tags">
        <div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tag</TableHead>
                <TableHead className="text-right">Total hours</TableHead>
                <TableHead className="text-right">Entries</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tags.length === 0 && (
                <EmptyRow
                  colSpan={3}
                  message="No tags have been applied to this client's time entries yet."
                />
              )}
              {tags.map((tag) => (
                <TableRow key={tag.id}>
                  <TableCell>
                    <span className="inline-flex items-center gap-2 font-medium text-foreground">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.name}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-smoke">
                    {formatHours(tag.totalSeconds)}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-smoke">
                    {tag.entryCount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </div>
  )
}
