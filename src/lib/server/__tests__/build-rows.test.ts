import { describe, it, expect } from 'vitest'
import {
  buildSyncRows,
  SHEET_HEADERS,
  UNASSIGNED_TAB,
} from '../gsheets/build-rows'
import type { SyncEntry, SyncMember } from '../gsheets/build-rows'

const SYNCED_AT = '2026-04-25T10:00:00.000Z'
const SYNCED_BY = 'Tester'

const baseWorkspace = { defaultBillableRate: 500, billableCurrency: 'PHP' }

function makeEntry(overrides: Partial<SyncEntry> = {}): SyncEntry {
  return {
    id: 'e1',
    description: 'Task',
    notes: '',
    startedAt: new Date('2026-04-20T01:00:00Z'),
    endedAt: new Date('2026-04-20T03:00:00Z'),
    durationSeconds: 7200,
    billable: true,
    projectId: 'p1',
    tagIds: [],
    workspaceMemberId: 'm1',
    ...overrides,
  }
}

const members: SyncMember[] = [
  {
    id: 'm1',
    name: 'Alice',
    email: 'alice@example.com',
    departmentName: 'Engineering',
    billableRate: 1000,
  },
  {
    id: 'm2',
    name: 'Bob',
    email: 'bob@example.com',
    departmentName: null,
    billableRate: null,
  },
]

const projects = [{ id: 'p1', name: 'API rewrite' }]
const tags = [
  { id: 't1', name: 'backend' },
  { id: 't2', name: 'urgent' },
]

describe('buildSyncRows', () => {
  it('groups entries by department, with unassigned at the end', () => {
    const result = buildSyncRows({
      entries: [
        makeEntry({ id: 'e1', workspaceMemberId: 'm1' }),
        makeEntry({ id: 'e2', workspaceMemberId: 'm2' }),
      ],
      members,
      projects,
      tags,
      workspace: baseWorkspace,
      syncedAtIso: SYNCED_AT,
      syncedByName: SYNCED_BY,
    })
    expect(result.departments.map((d) => d.tabName)).toEqual([
      'Engineering',
      UNASSIGNED_TAB,
    ])
    expect(result.totalRowCount).toBe(2)
  })

  it('produces a meta row, header row, then data rows per tab', () => {
    const result = buildSyncRows({
      entries: [makeEntry({ workspaceMemberId: 'm1' })],
      members,
      projects,
      tags,
      workspace: baseWorkspace,
      syncedAtIso: SYNCED_AT,
      syncedByName: SYNCED_BY,
    })
    const eng = result.departments.find((d) => d.tabName === 'Engineering')!
    expect(eng.rows[0][0]).toContain(`Last synced: ${SYNCED_AT}`)
    expect(eng.rows[0][0]).toContain(SYNCED_BY)
    expect(eng.rows[1]).toEqual([...SHEET_HEADERS])
    expect(eng.rows[2][0]).toBe('Alice')
    expect(eng.rows[2][3]).toBe('Task')
  })

  it('uses the member rate over the workspace default', () => {
    const result = buildSyncRows({
      entries: [makeEntry({ workspaceMemberId: 'm1' })],
      members,
      projects,
      tags,
      workspace: baseWorkspace,
      syncedAtIso: SYNCED_AT,
      syncedByName: SYNCED_BY,
    })
    const dataRow = result.departments[0].rows[2]
    // 2 hours × 1000/hr = 2000 PHP
    expect(dataRow[9]).toBe('2.00')
    expect(dataRow[10]).toContain('1,000')
    expect(dataRow[11]).toContain('2,000')
  })

  it('falls back to the workspace default rate when member rate is null', () => {
    const result = buildSyncRows({
      entries: [makeEntry({ workspaceMemberId: 'm2' })],
      members,
      projects,
      tags,
      workspace: baseWorkspace,
      syncedAtIso: SYNCED_AT,
      syncedByName: SYNCED_BY,
    })
    const dataRow = result.departments[0].rows[2]
    expect(dataRow[10]).toContain('500')
    expect(dataRow[11]).toContain('1,000') // 2h × 500 = 1000
  })

  it('leaves rate and amount columns blank for non-billable entries', () => {
    const result = buildSyncRows({
      entries: [makeEntry({ workspaceMemberId: 'm1', billable: false })],
      members,
      projects,
      tags,
      workspace: baseWorkspace,
      syncedAtIso: SYNCED_AT,
      syncedByName: SYNCED_BY,
    })
    const dataRow = result.departments[0].rows[2]
    expect(dataRow[6]).toBe('No')
    expect(dataRow[10]).toBe('')
    expect(dataRow[11]).toBe('')
  })

  it('joins multiple tag names with commas', () => {
    const result = buildSyncRows({
      entries: [makeEntry({ workspaceMemberId: 'm1', tagIds: ['t1', 't2'] })],
      members,
      projects,
      tags,
      workspace: baseWorkspace,
      syncedAtIso: SYNCED_AT,
      syncedByName: SYNCED_BY,
    })
    expect(result.departments[0].rows[2][5]).toBe('backend, urgent')
  })

  it('always emits at least an Unassigned tab when there are no entries', () => {
    const result = buildSyncRows({
      entries: [],
      members,
      projects,
      tags,
      workspace: baseWorkspace,
      syncedAtIso: SYNCED_AT,
      syncedByName: SYNCED_BY,
    })
    expect(result.departments).toHaveLength(1)
    expect(result.departments[0].tabName).toBe(UNASSIGNED_TAB)
    expect(result.departments[0].rows[2][0]).toBe('— No entries —')
    expect(result.totalRowCount).toBe(0)
  })

  it('handles missing project gracefully', () => {
    const result = buildSyncRows({
      entries: [makeEntry({ workspaceMemberId: 'm1', projectId: null })],
      members,
      projects,
      tags,
      workspace: baseWorkspace,
      syncedAtIso: SYNCED_AT,
      syncedByName: SYNCED_BY,
    })
    expect(result.departments[0].rows[2][4]).toBe('')
  })
})
