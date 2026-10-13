import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import { Client } from 'pg'
import { PgDialect } from 'drizzle-orm/pg-core'
import { buildPersonalTimeEntriesSql } from '../integrations/personal-time-entries.sql'
import { personalTimeEntriesQuerySchema } from '../integrations/external-api.shared'
import type {
  PersonalDaySummary,
  PersonalTimeEntry,
} from '../integrations/personal-time-entries.server'

// Only session-local temporary tables are written. Normal test runs do not need a database.
const connectionString = process.env.PERSONAL_API_TEST_DATABASE_URL
const now = new Date('2026-10-13T04:00:00Z')
const client = new Client({ connectionString, connectionTimeoutMillis: 10000 })
let connected = false
const dialect = new PgDialect()
async function run(input: Record<string, unknown> = {}, at = now) {
  const query = dialect.sqlToQuery(
    buildPersonalTimeEntriesSql(
      'self',
      personalTimeEntriesQuerySchema.parse(input),
      at,
    ),
  )
  const result = await client.query<{
    total: number
    data: PersonalTimeEntry[]
    summaries: PersonalDaySummary[]
  }>(query.sql, query.params)
  return result.rows[0]
}

describe.skipIf(!connectionString)(
  'personal time entries on PostgreSQL',
  () => {
    beforeAll(async () => {
      await client.connect()
      connected = true
      await client.query(`
      begin;
      set local timezone = 'UTC';
      create temporary table workspaces(id text primary key, name text, slug text, timezone text);
      create temporary table users(id text primary key, name text);
      create temporary table workspace_members(id text primary key, workspace_id text, user_id text, status text, email text);
      create temporary table time_entries(id text primary key, workspace_id text, workspace_member_id text, description text,
        project_id text, task_id text, billable boolean, started_at timestamptz, ended_at timestamptz, duration_seconds int,
        notes text, created_at timestamptz default now(), updated_at timestamptz default now());
      create temporary table projects(id text primary key, name text, workspace_id text, client_id text);
      create temporary table clients(id text primary key, name text, workspace_id text);
      create temporary table project_tasks(id text primary key, name text, workspace_id text, project_id text);
      create temporary table tags(id text primary key, workspace_id text);
      create temporary table time_entry_tags(time_entry_id text, tag_id text);
      insert into workspaces values ('manila','Manila','manila','Asia/Manila'),('utc','UTC','utc','UTC'),
        ('ny','New York','ny','America/New_York'),('disabled','Disabled','disabled','UTC'),('unowned','Unowned','unowned','UTC');
      insert into users values ('self','Me'),('other','Other');
      insert into workspace_members values ('m1','manila','self','ACTIVE','me@example.test'),
        ('m1b','manila','self','ACTIVE','alias@example.test'),('m2','utc','self','ACTIVE','me@example.test'),
        ('m3','ny','self','ACTIVE','me@example.test'),('m4','disabled','self','DISABLED','me@example.test'),
        ('foreign','manila','other','ACTIVE','other@example.test'),('wrong-ws','unowned','self','DISABLED','me@example.test');
      insert into time_entries(id,workspace_id,workspace_member_id,description,billable,started_at,ended_at,duration_seconds) values
        ('overnight','manila','m1','Overnight',true,'2026-10-12T15:00Z','2026-10-12T17:00Z',7200),
        ('completed','manila','m1','Completed',false,'2026-10-13T01:00Z','2026-10-13T02:00Z',3600),
        ('running','manila','m1','Running',false,'2026-10-13T02:00Z',null,0),
        ('other-user','manila','foreign','Secret',false,'2026-10-13T01:00Z','2026-10-13T03:00Z',7200),
        ('disabled-entry','disabled','m4','Secret',false,'2026-10-13T01:00Z','2026-10-13T03:00Z',7200),
        ('mismatched-tenant','manila','wrong-ws','Secret',false,'2026-10-13T01:00Z','2026-10-13T03:00Z',7200),
        ('end-boundary','utc','m2','Before',false,'2026-10-12T23:00Z','2026-10-13T00:00Z',3600),
        ('start-boundary','utc','m2','After',false,'2026-10-14T00:00Z','2026-10-14T01:00Z',3600),
        ('dst-spring','ny','m3','DST',false,'2026-03-08T05:00Z','2026-03-09T04:00Z',82800),
        ('dst-fall','ny','m3','DST',false,'2026-11-01T04:00Z','2026-11-02T05:00Z',90000);
      insert into tags values ('tag-a','manila'),('tag-b','manila'),('secret-tag','unowned');
      insert into time_entry_tags values ('completed','tag-b'),('completed','tag-a'),('other-user','secret-tag'),('completed','secret-tag');
    `)
    }, 20000)
    beforeEach(async () => {
      await client.query('savepoint test_case')
    })
    afterEach(async () => {
      await client.query('rollback to savepoint test_case')
    })
    afterAll(async () => {
      if (connected) {
        await client.query('rollback')
        await client.end()
      }
    })

    it('restricts records to self and active matching tenant memberships without duplicates', async () => {
      const result = await run({ date: '2026-10-13' })
      expect(result.data.map((entry) => entry.id)).toEqual([
        'overnight',
        'completed',
        'running',
      ])
      expect(result.total).toBe(3)
      expect(
        result.summaries.map((summary) => summary.workspace.id).sort(),
      ).toEqual(['manila', 'ny', 'utc'])
      const summary = result.summaries.find(
        (day) => day.workspace.id === 'manila',
      )!
      expect(summary).toMatchObject({
        date: '2026-10-13',
        timeIn: '2026-10-12T16:00:00+00:00',
        timeOut: null,
        running: true,
        entryCount: 3,
        durationSeconds: 14400,
      })
      expect(
        result.data.find((entry) => entry.id === 'completed')?.tagIds,
      ).toEqual(['tag-a', 'tag-b'])
      expect(result.data[0].startedAt).toBe('2026-10-12T15:00:00+00:00')
    })
    it('includes empty days and strict half-open boundaries', async () => {
      const result = await run({ date: '2026-10-13', workspaceId: 'utc' })
      expect(result.data).toEqual([])
      expect(result.summaries).toHaveLength(1)
      expect(result.summaries[0]).toMatchObject({
        timeIn: null,
        timeOut: null,
        durationSeconds: 0,
        entryCount: 0,
        running: false,
      })
    })
    it('uses each workspace local today and frozen now', async () => {
      const result = await run({}, new Date('2026-10-13T02:30:00Z'))
      expect(
        result.summaries.find((day) => day.workspace.id === 'ny')?.date,
      ).toBe('2026-10-12')
      expect(
        result.summaries.find((day) => day.workspace.id === 'manila')
          ?.durationSeconds,
      ).toBe(9000)
    })
    it('paginates globally while summaries and totals cover every matching record', async () => {
      await client.query(
        "insert into time_entries(id,workspace_id,workspace_member_id,description,billable,started_at,ended_at,duration_seconds) values ('utc-entry','utc','m2','Other workspace',false,'2026-10-13T03:30Z','2026-10-13T03:45Z',900)",
      )
      const first = await run({ date: '2026-10-13', limit: 1 })
      const second = await run({ date: '2026-10-13', limit: 1, page: 2 })
      expect(first.data[0].id).toBe('overnight')
      expect(second.data[0].id).toBe('completed')
      expect(first.summaries).toEqual(second.summaries)
      expect(second.total).toBe(4)
      expect(
        (await run({ date: '2026-10-13', limit: 1, page: 4 })).data[0].workspace
          .id,
      ).toBe('utc')
    })
    it('clips timestamp ranges and splits work at local midnight', async () => {
      const result = await run({
        workspaceId: 'manila',
        startDate: '2026-10-12T15:30:00Z',
        endDate: '2026-10-12T16:30:00Z',
      })
      expect(result.summaries).toHaveLength(2)
      expect(result.summaries.map((day) => day.durationSeconds)).toEqual([
        1800, 1800,
      ])
      expect(result.summaries[0].timeIn).toBe('2026-10-12T15:30:00+00:00')
      expect(result.summaries[1].timeOut).toBe('2026-10-12T16:30:00+00:00')
    })
    it('handles 23-hour and 25-hour DST days', async () => {
      expect(
        (await run({ date: '2026-03-08', workspaceId: 'ny' })).summaries[0]
          .durationSeconds,
      ).toBe(82800)
      expect(
        (await run({ date: '2026-11-01', workspaceId: 'ny' })).summaries[0]
          .durationSeconds,
      ).toBe(90000)
    })
    it('applies all record filters to counts and daily summaries', async () => {
      const result = await run({
        date: '2026-10-13',
        workspaceId: 'manila',
        billable: 'true',
        search: 'Overnight',
        running: 'false',
        memberId: 'm1',
      })
      expect(result.total).toBe(1)
      expect(result.summaries[0]).toMatchObject({
        entryCount: 1,
        durationSeconds: 3600,
        running: false,
        timeOut: '2026-10-12T17:00:00+00:00',
      })
      expect(
        (await run({ date: '2026-10-13', projectId: 'missing' })).total,
      ).toBe(0)
      expect((await run({ date: '2026-10-13', taskId: 'missing' })).total).toBe(
        0,
      )
      expect(
        (
          await run({
            date: '2026-10-13',
            updatedSince: '2099-01-01T00:00:00Z',
          })
        ).total,
      ).toBe(0)
    })
    it('whitelists sorting and breaks ties with entry id', async () => {
      expect(
        (
          await run({
            date: '2026-10-13',
            sortBy: 'durationSeconds',
            sortDir: 'desc',
          })
        ).data.map((entry) => entry.id),
      ).toEqual(['overnight', 'completed', 'running'])
    })
  },
)
