import {
  computeEffectiveRate,
  formatCurrency,
  normalizeCurrency,
} from '#/lib/time-tracker/billing'

export const SHEET_HEADERS = [
  'Member',
  'Email',
  'Date',
  'Description',
  'Project',
  'Tags',
  'Billable',
  'Started',
  'Ended',
  'Hours',
  'Rate/hr',
  'Amount',
  'Notes',
] as const

export const UNASSIGNED_TAB = 'Unassigned'

export type SyncEntry = {
  id: string
  description: string
  notes: string | null
  startedAt: Date
  endedAt: Date | null
  durationSeconds: number
  billable: boolean
  projectId: string | null
  tagIds: string[]
  workspaceMemberId: string
}

export type SyncMember = {
  id: string
  name: string
  email: string
  departmentName: string | null
  billableRate: number | null
}

export type SyncProject = { id: string; name: string }
export type SyncTag = { id: string; name: string }

export type SyncWorkspace = {
  defaultBillableRate: number
  billableCurrency: string
}

export type DepartmentRows = {
  tabName: string
  rows: string[][]
}

export type BuildRowsResult = {
  departments: DepartmentRows[]
  totalRowCount: number
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatLocalDateTime(date: Date) {
  return `${formatLocalDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function buildSyncRows({
  entries,
  members,
  projects,
  tags,
  workspace,
  syncedAtIso,
  syncedByName,
}: {
  entries: SyncEntry[]
  members: SyncMember[]
  projects: SyncProject[]
  tags: SyncTag[]
  workspace: SyncWorkspace
  syncedAtIso: string
  syncedByName: string
}): BuildRowsResult {
  const memberById = new Map(members.map((m) => [m.id, m]))
  const projectName = new Map(projects.map((p) => [p.id, p.name]))
  const tagName = new Map(tags.map((t) => [t.id, t.name]))
  const currency = normalizeCurrency(workspace.billableCurrency)
  const defaultRate = workspace.defaultBillableRate

  const grouped = new Map<string, SyncEntry[]>()
  for (const entry of entries) {
    const member = memberById.get(entry.workspaceMemberId)
    const dept = member?.departmentName?.trim() || UNASSIGNED_TAB
    const list = grouped.get(dept) ?? []
    list.push(entry)
    grouped.set(dept, list)
  }

  // Always emit at least an Unassigned tab so empty workspaces still get a sheet update.
  if (grouped.size === 0) grouped.set(UNASSIGNED_TAB, [])

  const departments: DepartmentRows[] = []
  let totalRowCount = 0

  const sortedTabs = [...grouped.keys()].sort((a, b) => {
    if (a === UNASSIGNED_TAB) return 1
    if (b === UNASSIGNED_TAB) return -1
    return a.localeCompare(b)
  })

  for (const tabName of sortedTabs) {
    const tabEntries = (grouped.get(tabName) ?? [])
      .slice()
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())

    const meta = [
      `Last synced: ${syncedAtIso} by ${syncedByName}`,
      ...Array(SHEET_HEADERS.length - 1).fill(''),
    ]
    const header = [...SHEET_HEADERS]

    const dataRows: string[][] = tabEntries.map((entry) => {
      const member = memberById.get(entry.workspaceMemberId)
      const memberName = member?.name ?? '—'
      const memberEmail = member?.email ?? ''
      const project = entry.projectId
        ? (projectName.get(entry.projectId) ?? '')
        : ''
      const tagList = entry.tagIds
        .map((id) => tagName.get(id))
        .filter(Boolean)
        .join(', ')
      const hours = entry.durationSeconds / 3600
      const effectiveRate = computeEffectiveRate(
        member?.billableRate ?? null,
        defaultRate,
      )
      const amount = entry.billable ? hours * effectiveRate : null

      return [
        memberName,
        memberEmail,
        formatLocalDate(entry.startedAt),
        entry.description,
        project,
        tagList,
        entry.billable ? 'Yes' : 'No',
        formatLocalDateTime(entry.startedAt),
        entry.endedAt ? formatLocalDateTime(entry.endedAt) : '',
        hours.toFixed(2),
        entry.billable ? formatCurrency(effectiveRate, currency) : '',
        amount === null ? '' : formatCurrency(amount, currency),
        entry.notes ?? '',
      ]
    })

    totalRowCount += dataRows.length

    if (dataRows.length === 0) {
      dataRows.push([
        '— No entries —',
        ...Array(SHEET_HEADERS.length - 1).fill(''),
      ])
    }

    const rows = [meta, header, ...dataRows]
    departments.push({ tabName, rows })
  }

  return { departments, totalRowCount }
}
