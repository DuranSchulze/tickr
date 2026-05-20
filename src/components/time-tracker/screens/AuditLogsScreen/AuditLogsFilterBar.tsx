import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Search, X } from 'lucide-react'

export type AuditLogsFilters = {
  action?: string
  actorEmail?: string
  fromDate?: string
  toDate?: string
}

type QuickRange = 'today' | '7d' | '30d' | 'custom' | ''

const ACTION_GROUPS = [
  {
    label: 'Members',
    actions: [
      { value: 'MEMBER_INVITE', label: 'Member invited' },
      { value: 'MEMBER_INVITE_RESEND', label: 'Invite resent' },
      { value: 'MEMBER_INVITE_REVOKE', label: 'Invite revoked' },
      { value: 'MEMBER_INVITE_ACCEPT', label: 'Invite accepted' },
      { value: 'MEMBER_ROLE_CHANGE', label: 'Role changed' },
      { value: 'MEMBER_DEPT_CHANGE', label: 'Department changed' },
      { value: 'MEMBER_STATUS_CHANGE', label: 'Status changed' },
    ],
  },
  {
    label: 'Catalogs',
    actions: [
      { value: 'CLIENT_CREATE', label: 'Client added' },
      { value: 'CLIENT_EDIT', label: 'Client edited' },
      { value: 'CLIENT_ARCHIVE', label: 'Client archived' },
      { value: 'PROJECT_CREATE', label: 'Project added' },
      { value: 'PROJECT_EDIT', label: 'Project edited' },
      { value: 'PROJECT_ARCHIVE', label: 'Project archived' },
      { value: 'TAG_CREATE', label: 'Tag added' },
      { value: 'TAG_EDIT', label: 'Tag edited' },
      { value: 'TAG_ARCHIVE', label: 'Tag archived' },
      { value: 'DEPT_CREATE', label: 'Department added' },
      { value: 'DEPT_EDIT', label: 'Department edited' },
      { value: 'DEPT_DELETE', label: 'Department deleted' },
      { value: 'ROLE_CREATE', label: 'Role created' },
      { value: 'COHORT_CREATE', label: 'Cohort added' },
      { value: 'COHORT_EDIT', label: 'Cohort edited' },
      { value: 'COHORT_DELETE', label: 'Cohort deleted' },
    ],
  },
  {
    label: 'Time entries',
    actions: [
      { value: 'ENTRY_CREATE', label: 'Entry created' },
      { value: 'ENTRY_EDIT', label: 'Entry edited' },
      { value: 'ENTRY_DELETE', label: 'Entry deleted' },
    ],
  },
  {
    label: 'Workspace & Sheets',
    actions: [
      { value: 'WORKSPACE_UPDATE', label: 'Workspace settings updated' },
      { value: 'GSHEET_URL_UPDATE', label: 'Sheet URL changed' },
      { value: 'GSHEET_SYNC', label: 'Sheet synced' },
      { value: 'GSHEET_IMPORT', label: 'Catalogs imported from sheet' },
    ],
  },
  {
    label: 'Exports',
    actions: [
      { value: 'EXPORT_MEMBERS', label: 'Members exported (CSV)' },
      { value: 'EXPORT_ANALYTICS', label: 'Analytics exported (CSV)' },
    ],
  },
]

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function getQuickRange(fromDate?: string, toDate?: string): QuickRange {
  if (!fromDate && !toDate) return ''
  const today = toIsoDate(new Date())
  const d7 = toIsoDate(new Date(Date.now() - 6 * 86_400_000))
  const d30 = toIsoDate(new Date(Date.now() - 29 * 86_400_000))
  if (fromDate === today && (!toDate || toDate === today)) return 'today'
  if (fromDate === d7 && (!toDate || toDate === today)) return '7d'
  if (fromDate === d30 && (!toDate || toDate === today)) return '30d'
  return 'custom'
}

export function AuditLogsFilterBar({
  filters,
  onChange,
}: {
  filters: AuditLogsFilters
  onChange: (next: AuditLogsFilters) => void
}) {
  const [localEmail, setLocalEmail] = useState(filters.actorEmail ?? '')
  const [showCustomDates, setShowCustomDates] = useState(
    getQuickRange(filters.fromDate, filters.toDate) === 'custom',
  )
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync local email when filters cleared externally
  useEffect(() => {
    if (!filters.actorEmail) setLocalEmail('')
  }, [filters.actorEmail])

  function handleEmailInput(value: string) {
    setLocalEmail(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onChange({ ...filters, actorEmail: value || undefined })
    }, 300)
  }

  function applyQuickRange(range: QuickRange) {
    const today = toIsoDate(new Date())
    if (range === 'today') {
      setShowCustomDates(false)
      onChange({ ...filters, fromDate: today, toDate: today })
    } else if (range === '7d') {
      setShowCustomDates(false)
      onChange({
        ...filters,
        fromDate: toIsoDate(new Date(Date.now() - 6 * 86_400_000)),
        toDate: today,
      })
    } else if (range === '30d') {
      setShowCustomDates(false)
      onChange({
        ...filters,
        fromDate: toIsoDate(new Date(Date.now() - 29 * 86_400_000)),
        toDate: today,
      })
    } else if (range === 'custom') {
      setShowCustomDates(true)
    } else {
      setShowCustomDates(false)
      onChange({ ...filters, fromDate: undefined, toDate: undefined })
    }
  }

  const activeRange = getQuickRange(filters.fromDate, filters.toDate)
  const hasActiveFilters =
    !!filters.action ||
    !!filters.actorEmail ||
    !!filters.fromDate ||
    !!filters.toDate

  function clearAll() {
    setLocalEmail('')
    setShowCustomDates(false)
    onChange({})
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* Actor email search */}
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search by actor email…"
            value={localEmail}
            onChange={(e) => handleEmailInput(e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>

        {/* Action dropdown */}
        <select
          value={filters.action ?? ''}
          onChange={(e) =>
            onChange({ ...filters, action: e.target.value || undefined })
          }
          className="h-9 min-w-[180px] rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
        >
          <option value="">All event types</option>
          {ACTION_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.actions.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        {/* Quick date range */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
          <CalendarDays className="ml-1.5 h-3.5 w-3.5 text-muted-foreground" />
          {(
            [
              { key: '', label: 'Any time' },
              { key: 'today', label: 'Today' },
              { key: '7d', label: '7 days' },
              { key: '30d', label: '30 days' },
              { key: 'custom', label: 'Custom' },
            ] as { key: QuickRange; label: string }[]
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => applyQuickRange(key)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                activeRange === key || (key === '' && activeRange === '')
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Custom date inputs */}
      {(showCustomDates || activeRange === 'custom') && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            From
          </span>
          <input
            type="date"
            value={filters.fromDate ?? ''}
            onChange={(e) =>
              onChange({ ...filters, fromDate: e.target.value || undefined })
            }
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
          />
          <span className="text-xs font-medium text-muted-foreground">to</span>
          <input
            type="date"
            value={filters.toDate ?? ''}
            onChange={(e) =>
              onChange({ ...filters, toDate: e.target.value || undefined })
            }
            min={filters.fromDate}
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>
      )}
    </div>
  )
}
