import { useCallback, useState } from 'react'
import { Briefcase, Clock, FileText, Loader2 } from 'lucide-react'
import { gooeyToast } from 'goey-toast'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { useNowTick } from '#/components/time-tracker/dashboard/hooks/useNowTick'
import { formatDuration } from '#/lib/time-tracker/store'
import { formatCurrency } from '#/lib/time-tracker/billing'
import { getMemberMonthlyReportFn } from '#/lib/server/tracker'
import type { WorkspaceMemberActivity } from '#/lib/server/tracker/activity.server'

function MemberAvatar({
  name,
  avatarUrl,
}: {
  name: string
  avatarUrl: string | null
}) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('')

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="h-10 w-10 shrink-0 rounded-full object-cover"
      />
    )
  }

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
      {initials}
    </div>
  )
}

function ElapsedTimer({ startedAt }: { startedAt: string }) {
  const now = useNowTick(1000)
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now - new Date(startedAt).getTime()) / 1000),
  )
  return (
    <span className="font-mono text-sm tabular-nums text-foreground">
      {formatDuration(elapsedSeconds)}
    </span>
  )
}

function generateMonthOptions() {
  const now = new Date()
  const options: { value: string; label: string }[] = []
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const label = d.toLocaleDateString('en-PH', {
      month: 'long',
      year: 'numeric',
    })
    options.push({ value: `${y}-${m}`, label })
  }
  return options
}

const monthOptions = generateMonthOptions()

export function MemberActivityCard({
  member,
}: {
  member: WorkspaceMemberActivity
}) {
  const isOnline = member.activeEntry !== null

  const [exportPopoverOpen, setExportPopoverOpen] = useState(false)
  const [exportingMonth, setExportingMonth] = useState<string | null>(null)

  const handleExportMonthlyReport = useCallback(
    async (month: string) => {
      setExportPopoverOpen(false)
      setExportingMonth(month)
      try {
        const report = await getMemberMonthlyReportFn({
          data: { memberId: member.memberId, month },
        })

        const pad = (n: number) => String(n).padStart(2, '0')
        const fmtDate = (d: string) => {
          const date = new Date(d + 'T00:00:00')
          return date.toLocaleDateString('en-PH', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
        }
        const fmtHrs = (s: number) => {
          const h = Math.floor(s / 3600)
          const m = Math.floor((s % 3600) / 60)
          return `${h}h ${pad(m)}m`
        }

        const [year, mon] = month.split('-')
        const monthName = new Date(
          Number(year),
          Number(mon) - 1,
        ).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })

        const totalHrs = fmtHrs(report.summary.totalSeconds)
        const billableHrs = fmtHrs(report.summary.billableSeconds)

        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Time Report - ${report.memberName} - ${monthName}</title>
  <style>
    @page { margin: 1.5cm; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #1a1a1a; }
    .header { text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #2563eb; }
    .header h1 { margin: 0; font-size: 20px; color: #2563eb; }
    .header p { margin: 4px 0 0; color: #666; font-size: 13px; }
    .summary-row { display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
    .summary-card { flex: 1; min-width: 120px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; }
    .summary-card .label { font-size: 10px; text-transform: uppercase; color: #666; font-weight: 600; letter-spacing: 0.5px; }
    .summary-card .value { font-size: 18px; font-weight: 800; margin-top: 4px; }
    .summary-card .value.primary { color: #2563eb; }
    .summary-card .value.green { color: #16a34a; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f3f4f6; text-align: left; padding: 8px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; border-bottom: 2px solid #e5e7eb; }
    td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.center { text-align: center; }
    .billable-badge { background: #dcfce7; color: #16a34a; padding: 1px 6px; border-radius: 4px; font-size: 9px; font-weight: 600; }
    .nonbillable-badge { background: #f3f4f6; color: #9ca3af; padding: 1px 6px; border-radius: 4px; font-size: 9px; font-weight: 600; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center; }
    .total-row td { font-weight: 700; border-top: 2px solid #1a1a1a; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Time Entry Report</h1>
    <p>${report.memberName} &middot; ${report.memberEmail}</p>
    <p>${monthName}</p>
  </div>

  <div class="summary-row">
    <div class="summary-card">
      <div class="label">Total Hours</div>
      <div class="value primary">${totalHrs}</div>
    </div>
    <div class="summary-card">
      <div class="label">Billable Hours</div>
      <div class="value green">${billableHrs}</div>
    </div>
    <div class="summary-card">
      <div class="label">Total Entries</div>
      <div class="value">${report.summary.entryCount}</div>
    </div>
    <div class="summary-card">
      <div class="label">Billable Amount</div>
      <div class="value green">${report.summary.totalBillableAmount > 0 ? formatCurrency(report.summary.totalBillableAmount, report.currency) : '\u2014'}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Project / Client</th>
        <th>Tags</th>
        <th>Description</th>
        <th>Hours</th>
        <th>Rate</th>
        <th class="num">Amount</th>
        <th class="center">Type</th>
      </tr>
    </thead>
    <tbody>
      ${report.entries
        .map(
          (e) => `
        <tr>
          <td>${fmtDate(e.date)}</td>
          <td>${[e.projectName, e.clientName].filter(Boolean).join(' \u00b7 ') || '\u2014'}</td>
          <td>${e.tagNames.join(', ') || '\u2014'}</td>
          <td>${e.description || 'Untitled'}</td>
          <td class="num">${fmtHrs(e.durationSeconds)}</td>
          <td class="num">${e.billable ? formatCurrency(e.effectiveRate, report.currency) : '\u2014'}</td>
          <td class="num">${e.billableAmount != null ? formatCurrency(e.billableAmount, report.currency) : '\u2014'}</td>
          <td class="center">${e.billable ? '<span class="billable-badge">Billable</span>' : '<span class="nonbillable-badge">Non-billable</span>'}</td>
        </tr>
      `,
        )
        .join('')}
    </tbody>
  </table>

  <div class="footer">
    Generated on ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })} &middot; Tickr
  </div>

  <script>window.print()</script>
</body>
</html>`

        const win = window.open('', '_blank')
        if (win) {
          win.document.write(html)
          win.document.close()
        }
      } catch (err) {
        gooeyToast.error('Export failed', {
          description:
            err instanceof Error ? err.message : 'Could not generate report.',
        })
      } finally {
        setExportingMonth(null)
      }
    },
    [member.memberId],
  )

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 transition-colors">
      <div className="relative">
        <MemberAvatar name={member.name} avatarUrl={member.avatarUrl} />
        <span
          aria-hidden="true"
          className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card ${
            isOnline ? 'bg-emerald-500' : 'bg-muted-foreground/40'
          }`}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">
            {member.name}
          </p>
          <span
            aria-label={isOnline ? 'Online' : 'Offline'}
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
              isOnline
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>

        {isOnline && member.activeEntry ? (
          <div className="mt-1.5 space-y-1">
            <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <Briefcase className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {member.activeEntry.projectName ?? 'No project'}
              </span>
            </p>
            <p className="truncate text-xs text-foreground/80">
              {member.activeEntry.description || 'No description'}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              <ElapsedTimer startedAt={member.activeEntry.startedAt} />
            </p>
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Not working</p>
        )}

        {/* Export button */}
        <div className="mt-3 flex justify-end">
          <Popover open={exportPopoverOpen} onOpenChange={setExportPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={() =>
                  !exportingMonth && setExportPopoverOpen((v) => !v)
                }
                title={
                  exportingMonth
                    ? 'Generating report\u2026'
                    : 'Export monthly report'
                }
                disabled={!!exportingMonth}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  exportPopoverOpen
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {exportingMonth ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileText className="h-3.5 w-3.5" />
                )}
                Export
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={4} className="w-48 p-1">
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                Select month
              </div>
              {monthOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => handleExportMonthlyReport(option.value)}
                  disabled={!!exportingMonth}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {exportingMonth === option.value ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 text-primary" />
                  )}
                  {option.label}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  )
}
