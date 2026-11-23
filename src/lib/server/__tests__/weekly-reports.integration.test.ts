/** Defaults to PGlite. Set WEEKLY_REPORT_TEST_DATABASE_URL to exercise multiple PostgreSQL connections. */
import { readFileSync } from 'node:fs'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import pg from 'pg'
import { PGlite } from '@electric-sql/pglite'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

import {
  confirmMissingWeekday,
  getMissingWeekday,
  latestCompletedWeekday,
  undoMissingWeekday,
} from '../tracker/missing-weekday.server'
import {
  buildDepartmentReport,
  getAccessibleDepartmentReport,
} from '../tracker/weekly-department-report.server'
import { prepareDepartmentReportDownload } from '../tracker/weekly-department-download.server'
import { runWeeklyReports } from '../tracker/weekly-reports.server'
import {
  getWeeklyReportPreferences,
  updateWeeklyReportPreferences,
} from '../weekly-report-preferences.server'
import { WeeklyEmailError } from '../mailer'

import type * as MailerModule from '../mailer'
import type * as ExportModule from '#/lib/time-tracker/weekly-department-report-export'
import type * as WorkspaceAccessModule from '../workspace-access.server'

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  pdf: vi.fn(),
  send: vi.fn(),
  access: vi.fn(),
  session: vi.fn(),
}))
vi.mock('@tanstack/react-start/server-only', () => ({}))
vi.mock('#/db', () => ({ db: { execute: mocks.execute } }))
vi.mock(
  '#/lib/time-tracker/weekly-department-report-export',
  async (importOriginal) => ({
    ...(await importOriginal<typeof ExportModule>()),
    buildWeeklyDepartmentPdf: mocks.pdf,
  }),
)
vi.mock('../workspace-access.server', async (importOriginal) => ({
  ...(await importOriginal<typeof WorkspaceAccessModule>()),
  requireWorkspaceAccess: mocks.access,
  getAuthSession: mocks.session,
}))
vi.mock('../csrf.server', () => ({ assertTrustedOrigin: vi.fn() }))
vi.mock('../subscription-gate.server', () => ({
  assertWorkspaceWriteAccess: vi.fn(),
}))
vi.mock('../mailer', async (importOriginal) => ({
  ...(await importOriginal<typeof MailerModule>()),
  sendWeeklyReportEmail: mocks.send,
}))

const url = process.env.WEEKLY_REPORT_TEST_DATABASE_URL
describe('weekly reports against PostgreSQL', () => {
  let pool: {
    query: (
      sql: string,
      params?: unknown[],
    ) => Promise<{ rows: Record<string, unknown>[] }>
    end: () => Promise<void>
  }
  const schema = `weekly_test_${process.pid}`
  const fixedNow = '2026-10-25T00:05:00Z'
  const dialect = new PgDialect()
  beforeAll(async () => {
    if (url) {
      const parsed = new URL(url)
      if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))
        throw new Error('Tests require disposable localhost PostgreSQL')
      pg.types.setTypeParser(1082, (value) => value)
      const postgres = new pg.Pool({
        connectionString: url,
        options: `-c search_path=${schema},pg_catalog`,
      })
      pool = {
        query: (sql, params) => postgres.query(sql, params),
        end: () => postgres.end(),
      }
      await pool.query(`create schema ${schema}`)
    } else {
      const postgres = new PGlite()
      await postgres.exec(
        `create schema ${schema}; set search_path to ${schema},pg_catalog`,
      )
      pool = {
        query: async (sql, params) =>
          params
            ? postgres.query(sql, params)
            : ((await postgres.exec(sql)).at(-1) ?? { rows: [] }),
        end: () => postgres.close(),
      }
    }
    await pool.query(
      `create function ${schema}.now() returns timestamptz language sql stable as $$select '${fixedNow}'::timestamptz$$`,
    )
    await pool.query(`create table workspaces (id varchar(30) primary key, name text not null, timezone text not null);
      create table users (id varchar(30) primary key, email text not null, name text);
      create table departments (id varchar(30) primary key, workspace_id varchar(30) not null, name text not null);
      create table workspace_roles (id varchar(30) primary key, workspace_id varchar(30) not null, permission_level text not null);
      create table workspace_members (id varchar(30) primary key, workspace_id varchar(30) not null references workspaces(id),
        user_id varchar(30) references users(id), status text not null default 'ACTIVE',
        updated_at timestamptz default now(), created_at timestamptz not null default '2026-10-01',
        email text not null default 'staff@example.com', department_id varchar(30), workspace_role_id varchar(30));
      create table time_entries (workspace_id varchar(30) not null, workspace_member_id varchar(30) not null,
        started_at timestamptz not null, ended_at timestamptz, billable boolean not null default false);`)
    for (const name of [
      '0026_weekly_personal_reports',
      '0028_weekly_department_reports',
    ]) {
      const migration = readFileSync(`drizzle/${name}.sql`, 'utf8').replaceAll(
        '"public".',
        `"${schema}".`,
      )
      await pool.query(migration)
    }
  }, 30_000)
  afterAll(async () => {
    if (pool) {
      await pool.query(`drop schema ${schema} cascade`)
      await pool.end()
    }
  })
  beforeEach(async () => {
    mocks.execute.mockImplementation(async (query: SQL) => {
      const compiled = dialect.sqlToQuery(query)
      const result = await pool.query(compiled.sql, compiled.params)
      // Neon HTTP returns timestamp strings; pg uses Date objects by default.
      return {
        ...result,
        rows: result.rows.map((row) =>
          Object.fromEntries(
            Object.entries(row).map(([k, v]) => [
              k,
              v instanceof Date ? v.toISOString() : v,
            ]),
          ),
        ),
      }
    })
    vi.stubEnv('WEEKLY_REPORT_EMAILS_ENABLED', 'true')
    vi.stubEnv('WEEKLY_REPORT_WORKSPACE_IDS', '')
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    vi.stubEnv('APP_URL', 'https://tickr.example')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(fixedNow))
    await pool.query(
      'truncate weekly_report_jobs, weekly_report_schedules, weekly_report_throttle, weekly_department_reports, weekday_confirmations, time_entries, workspace_members, users, workspaces, departments, workspace_roles cascade',
    )
    await pool.query(`insert into workspaces values ('w1','Workspace One','Asia/Manila'),('w2','Workspace Two','Asia/Manila');
      insert into users values ('u1','me@example.com','Admin One'),('u2','other@example.com','Admin Two');
      insert into departments values ('d1','w1','Operations'),('d2','w2','Finance'),('other','w1','Other');
      insert into workspace_roles values ('r1','w1','ADMIN'),('r2','w2','OWNER'),('employee','w1','EMPLOYEE');
      insert into workspace_members (id,workspace_id,user_id,weekly_report_enabled_at,department_id,workspace_role_id) values
        ('m1','w1','u1','2026-10-01','d1','r1'),('m2','w2','u2','2026-10-01','d2','r2'),
        ('staff','w1',null,'2026-10-01','d1','employee');
      update workspace_members set department_assigned_at = '2026-10-01';
      insert into weekly_report_schedules (workspace_id,timezone,due_at) values ('w1','Asia/Manila','2026-10-25T00:00:00Z');`)
    mocks.session.mockReset().mockResolvedValue({ user: { id: 'u1' } })
    mocks.pdf
      .mockReset()
      .mockResolvedValue(new TextEncoder().encode('%PDF-test'))
    mocks.send
      .mockReset()
      .mockResolvedValue({ provider: 'resend', id: 'provider-1' })
    mocks.access.mockReset().mockResolvedValue({
      member: { id: 'm1', workspaceRole: { permissionLevel: 'ADMIN' } },
      workspace: { id: 'w1', name: 'Workspace One', timezone: 'Asia/Manila' },
      session: { user: { id: 'u1' } },
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })
  async function job() {
    return (
      await pool.query(
        'select j.*, j.week_start::text as week_start from weekly_report_jobs j order by id limit 1',
      )
    ).rows[0]
  }
  it('isolates workspace/member data, attaches a PDF, and deduplicates subsequent invocations', async () => {
    await runWeeklyReports()
    expect(mocks.pdf).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: 'w1',
        department_id: 'd1',
        week_start: '2026-10-18',
        week_end: '2026-10-24',
      }),
      expect.arrayContaining([
        expect.objectContaining({
          member_id: 'staff',
          local_date: '2026-10-24',
        }),
      ]),
    )
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'me@example.com',
        attachments: [
          expect.objectContaining({
            filename: 'weekly-operations-2026-10-18-to-2026-10-24.pdf',
          }),
        ],
      }),
      'weekly-report/dept:w1:m1:2026-10-18',
    )
    expect(await job()).toMatchObject({
      status: 'sent',
      payload: null,
      provider_id: 'provider-1',
      attempts: 1,
    })
    await runWeeklyReports()
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })
  it('does not enqueue old reports when a workspace first enters rollout', async () => {
    await pool.query('delete from weekly_report_schedules')
    await runWeeklyReports()
    expect(mocks.send).not.toHaveBeenCalled()
    expect(
      (
        await pool.query(
          "select due_at from weekly_report_schedules where workspace_id='w1'",
        )
      ).rows[0].due_at,
    ).toEqual(new Date('2026-11-01T00:00:00.000Z'))
  })
  it('sends empty weeks with all seven dates for each member', async () => {
    await runWeeklyReports()
    expect(mocks.pdf.mock.calls[0][1]).toHaveLength(14)
    expect(
      mocks.pdf.mock.calls[0][1].every(
        (row: { status: string }) => row.status === 'NO_TIME',
      ),
    ).toBe(true)
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })
  it('freezes content on a rate-limit failure and reuses identical content on retry', async () => {
    mocks.send.mockRejectedValueOnce(new WeeklyEmailError('retryable', 120))
    await runWeeklyReports()
    const first = await job()
    expect(first.status).toBe('retryable_failure')
    expect(first.payload).toMatchObject({ to: 'me@example.com' })
    // Advance server eligibility and JS retry clock independently of the schedule.
    await pool.query(
      'update weekly_report_jobs set next_attempt_at=now(); update weekly_report_throttle set next_allowed_at=now()',
    )
    await runWeeklyReports()
    expect(mocks.pdf).toHaveBeenCalledTimes(1)
    expect(mocks.send.mock.calls[0]).toEqual(mocks.send.mock.calls[1])
    expect(await job()).toMatchObject({
      status: 'sent',
      payload: null,
      attempts: 2,
    })
  })
  it('records uncertain delivery and never automatically retries', async () => {
    mocks.send.mockRejectedValue(new WeeklyEmailError('uncertain'))
    await runWeeklyReports()
    await runWeeklyReports()
    expect(await job()).toMatchObject({ status: 'uncertain', payload: null })
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })
  it('handles database failure after provider acceptance conservatively', async () => {
    const implementation = mocks.execute.getMockImplementation()!
    let failed = false
    mocks.execute.mockImplementation(async (query: SQL) => {
      const q = dialect.sqlToQuery(query)
      if (
        !failed &&
        q.sql.includes('provider_id =') &&
        q.params.includes('sent')
      ) {
        failed = true
        throw new Error('db unavailable')
      }
      return implementation(query)
    })
    try {
      await runWeeklyReports()
      expect(await job()).toMatchObject({
        status: 'uncertain',
        error: 'delivery_persistence_failed',
      })
      expect(mocks.send).toHaveBeenCalledTimes(1)
    } finally {
      mocks.execute.mockImplementation(implementation)
    }
  })
  it('sends a report link without an oversized attachment', async () => {
    mocks.pdf.mockResolvedValue(new Uint8Array(10 * 1024 * 1024 + 1))
    await runWeeklyReports()
    expect(await job()).toMatchObject({ status: 'sent' })
    expect(mocks.send.mock.calls[0][0].attachments).toBeUndefined()
    expect(mocks.send.mock.calls[0][0].text).toContain(
      'https://tickr.example/weekly-department-report/',
    )
  })
  it('attaches a PDF at the exact raw-size limit', async () => {
    mocks.pdf.mockResolvedValue(new Uint8Array(10 * 1024 * 1024))
    await runWeeklyReports()
    expect(mocks.send.mock.calls[0][0].attachments).toHaveLength(1)
  })
  it('still sends the download link if PDF generation fails', async () => {
    mocks.pdf.mockRejectedValueOnce(new Error('PDF could not render'))
    await runWeeklyReports()
    expect(await job()).toMatchObject({ status: 'sent' })
    expect(mocks.send.mock.calls[0][0]).not.toHaveProperty('attachments')
    expect(mocks.send.mock.calls[0][0].text).toContain(
      '/weekly-department-report/',
    )
  })
  it('rechecks preferences after rendering and cancels unsent work', async () => {
    mocks.pdf.mockImplementation(async () => {
      await updateWeeklyReportPreferences(false)
      return new Uint8Array([1])
    })
    await runWeeklyReports()
    expect(await job()).toMatchObject({
      status: 'skipped',
      error: 'preference_disabled',
    })
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('does not change another member or workspace preference', async () => {
    await updateWeeklyReportPreferences(false)
    const rows = (
      await pool.query(
        'select id, weekly_report_email_enabled from workspace_members where user_id is not null order by id',
      )
    ).rows
    expect(rows).toEqual([
      { id: 'm1', weekly_report_email_enabled: false },
      { id: 'm2', weekly_report_email_enabled: true },
    ])
    expect(await getWeeklyReportPreferences()).toMatchObject({
      enabled: false,
      email: 'me@example.com',
    })
    await updateWeeklyReportPreferences(true)
    await runWeeklyReports()
    expect(mocks.send).not.toHaveBeenCalled() // re-enable cannot backfill the already-due period
  })
  it('restricts rollout to the allowlist', async () => {
    vi.stubEnv('WEEKLY_REPORT_WORKSPACE_IDS', 'w2')
    await runWeeklyReports()
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('turns off all scheduling and sends when the kill switch is off', async () => {
    vi.stubEnv('WEEKLY_REPORT_EMAILS_ENABLED', 'false')
    expect(await runWeeklyReports()).toEqual({ enabled: false })
    expect(await job()).toBeUndefined()
  })
  it('survives concurrent cron runs without duplicate sends', async () => {
    await Promise.all([runWeeklyReports(), runWeeklyReports()])
    expect(mocks.send).toHaveBeenCalledTimes(1)
    expect(
      (await pool.query('select count(*)::int as n from weekly_report_jobs'))
        .rows[0].n,
    ).toBe(1)
  })
  it('recovers an expired pre-send lease but quarantines a potentially sent job', async () => {
    await pool.query(`insert into weekly_report_jobs (id,workspace_id,member_id,week_start,week_end,timezone,due_at,status,attempts,lease_until,report_type,attempt_started_in_lease)
      values ('crashed','w2','m2','2026-10-18','2026-10-24','Asia/Manila','2026-10-25T00:00Z','processing',1,now()-interval '1 minute','department',true)`)
    await runWeeklyReports()
    expect(
      (
        await pool.query(
          "select status from weekly_report_jobs where id='crashed'",
        )
      ).rows[0].status,
    ).toBe('uncertain')
    expect(mocks.send).toHaveBeenCalledTimes(1) // only w1
  })
  it('rejects access to preferences through a mismatched account', async () => {
    mocks.access.mockResolvedValue({
      member: { id: 'm2', workspaceRole: { permissionLevel: 'OWNER' } },
      workspace: { id: 'w2', name: 'Workspace Two', timezone: 'Asia/Manila' },
      session: { user: { id: 'u1' } },
    })
    await expect(getWeeklyReportPreferences()).rejects.toThrow(
      'Active membership required',
    )
    await expect(updateWeeklyReportPreferences(false)).rejects.toThrow(
      'Weekly email settings require an active department assignment',
    )
    expect(
      (
        await pool.query(
          "select weekly_report_email_enabled from workspace_members where id='m2'",
        )
      ).rows[0].weekly_report_email_enabled,
    ).toBe(true)
  })
  it('skips inactive members and members without accounts', async () => {
    await pool.query(
      "update workspace_members set status='INVITED' where id='m1'",
    )
    await runWeeklyReports()
    expect(mocks.send).not.toHaveBeenCalled()
    expect(await job()).toBeUndefined()
  })
  it('does not retry a frozen report to an old account email', async () => {
    mocks.send.mockRejectedValueOnce(new WeeklyEmailError('retryable'))
    await runWeeklyReports()
    await pool.query(
      "update users set email='new@example.com' where id='u1'; update weekly_report_jobs set next_attempt_at=now(); update weekly_report_throttle set next_allowed_at=now()",
    )
    await runWeeklyReports()
    expect(await job()).toMatchObject({
      status: 'skipped',
      error: 'recipient_or_preference_changed',
      payload: null,
    })
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })
  it('catches up the latest Sunday after a multiweek outage without sending old weeks', async () => {
    await pool.query(
      "update weekly_report_schedules set due_at='2026-10-04T00:00Z'",
    )
    await runWeeklyReports()
    expect(await job()).toMatchObject({
      week_start: '2026-10-18',
      status: 'sent',
    })
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })
  it('does not allow one invalid workspace timezone to block others', async () => {
    await pool.query(
      "update workspaces set timezone='Invalid/Timezone' where id='w2'",
    )
    await runWeeklyReports()
    expect(await job()).toMatchObject({ status: 'sent' })
    expect(
      (
        await pool.query(
          "select count(*)::int n from weekly_report_schedules where workspace_id='w2'",
        )
      ).rows[0].n,
    ).toBe(0)
  })
  it('terminates retries after five attempts and clears the payload', async () => {
    mocks.send.mockRejectedValueOnce(new WeeklyEmailError('retryable'))
    await runWeeklyReports()
    await pool.query(
      'update weekly_report_jobs set attempts=5,next_attempt_at=now(); update weekly_report_throttle set next_allowed_at=now()',
    )
    await runWeeklyReports()
    expect(await job()).toMatchObject({
      status: 'terminal_failure',
      error: 'retry_window_exhausted',
      payload: null,
    })
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })
  it('prunes terminal metadata after 90 days', async () => {
    await pool.query(
      "insert into weekly_report_jobs (id,workspace_id,member_id,week_start,week_end,timezone,due_at,status,updated_at) values ('old','w2','m2','2026-06-01','2026-06-07','Asia/Manila','2026-06-08','sent',now()-interval '91 days')",
    )
    await runWeeklyReports()
    expect(
      (await pool.query("select id from weekly_report_jobs where id='old'"))
        .rows,
    ).toHaveLength(0)
  })
  it('pages recipients durably and shares one department report', async () => {
    await pool.query(`insert into users (id,email) select 'bulk-u-'||i, 'bulk-'||i||'@example.com' from generate_series(1,250) i;
      insert into workspace_members (id,workspace_id,user_id,weekly_report_enabled_at,department_id,workspace_role_id)
      select 'bulk-m-'||lpad(i::text,3,'0'), 'w1','bulk-u-'||i,'2026-10-01','d1','r1' from generate_series(1,250) i;
      insert into weekly_report_throttle values ('resend', now()+interval '1 hour');`)
    await runWeeklyReports()
    expect(
      (await pool.query('select count(*)::int n from weekly_report_jobs'))
        .rows[0].n,
    ).toBe(250)
    expect(
      (
        await pool.query(
          "select member_cursor from weekly_report_schedules where workspace_id='w1'",
        )
      ).rows[0].member_cursor,
    ).not.toBe('')
    await runWeeklyReports()
    expect(
      (await pool.query('select count(*)::int n from weekly_report_jobs'))
        .rows[0].n,
    ).toBe(251)
    expect(
      (
        await pool.query(
          "select member_cursor from weekly_report_schedules where workspace_id='w1'",
        )
      ).rows[0].member_cursor,
    ).toBe('')
  }, 30_000)

  it('selects Friday after local midnight on Monday', () => {
    expect(
      latestCompletedWeekday(new Date('2026-10-25T16:00:00Z'), 'Asia/Manila'),
    ).toBe('2026-10-23')
  })
  it('splits work using the correct local midnight across a timezone offset change', async () => {
    await pool.query(`update workspace_members
      set created_at = '2026-03-01', department_assigned_at = '2026-03-01' where id = 'm1';
      insert into time_entries values ('w1','m1','2026-03-26T21:30Z','2026-03-26T22:30Z',false);`)
    const rows = await buildDepartmentReport(
      {
        id: 'report',
        department_id: 'd1',
        department_name: 'Operations',
        workspace_id: 'w1',
        workspace_name: 'Workspace One',
        week_start: '2026-03-22',
        week_end: '2026-03-28',
        timezone: 'Asia/Jerusalem',
      },
      20,
    )
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          local_date: '2026-03-26',
          worked_seconds: 1800,
        }),
        expect.objectContaining({
          local_date: '2026-03-27',
          worked_seconds: 1800,
        }),
      ]),
    )
  })
  it('writes one confirmation, supports undo, and rejects overnight overlap', async () => {
    const date = '2026-10-23'
    expect(await getMissingWeekday('w1')).toMatchObject({ date })
    expect(await getMissingWeekday('w2')).toBeNull()
    await expect(confirmMissingWeekday('w1', date, 'u2')).rejects.toThrow()
    expect(
      await Promise.all([
        confirmMissingWeekday('w1', date, 'u1'),
        confirmMissingWeekday('w1', date, 'u1'),
      ]),
    ).toEqual(['confirmed', 'confirmed'])
    expect(
      (await pool.query('select count(*)::int n from weekday_confirmations'))
        .rows[0].n,
    ).toBe(1)
    await undoMissingWeekday('w1', date, 'u1')
    expect(await getMissingWeekday('w1')).toMatchObject({ date })
    await pool.query(
      "insert into time_entries values ('w1','m1','2026-10-22T15:30Z','2026-10-22T16:30Z',true)",
    )
    expect(await confirmMissingWeekday('w1', date, 'u1')).toBe('ineligible')
    await pool.query('update time_entries set ended_at = null')
    expect(await getMissingWeekday('w1')).toBeNull()
  })

  it('splits overnight work, includes weekend rows, and suppresses a late confirmation', async () => {
    await confirmMissingWeekday('w1', '2026-10-23', 'u1')
    await pool.query(`insert into time_entries values
      ('w1','m1','2026-10-22T15:30Z','2026-10-22T16:30Z',true),
      ('w1','m1','2026-10-23T22:00Z','2026-10-23T23:00Z',false),
      ('w2','m2','2026-10-23T22:00Z','2026-10-23T23:00Z',true);
      insert into weekday_confirmations values ('w1','staff','2026-10-21',now());`)
    await runWeeklyReports()
    expect(mocks.pdf.mock.calls[0][1]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          local_date: '2026-10-18',
          status: 'NO_TIME',
        }),
        expect.objectContaining({
          local_date: '2026-10-22',
          member_id: 'm1',
          worked_seconds: 1800,
          billable_seconds: 1800,
        }),
        expect.objectContaining({
          local_date: '2026-10-23',
          member_id: 'm1',
          status: 'WORK',
          worked_seconds: 1800,
        }),
        expect.objectContaining({
          local_date: '2026-10-24',
          member_id: 'm1',
          status: 'WORK',
          worked_seconds: 3600,
          billable_seconds: 0,
        }),
        expect.objectContaining({
          local_date: '2026-10-21',
          member_id: 'staff',
          status: 'N/A',
          worked_seconds: 0,
          time_in: null,
        }),
      ]),
    )
  })

  it('clears a frozen PDF when its roster has changed before retry', async () => {
    mocks.send.mockRejectedValueOnce(new WeeklyEmailError('retryable'))
    await runWeeklyReports()
    await pool.query(`update workspace_members set department_id = 'other' where id = 'staff';
      update weekly_report_jobs set next_attempt_at=now();
      update weekly_report_throttle set next_allowed_at=now();`)
    await runWeeklyReports()
    expect(await job()).toMatchObject({
      status: 'skipped',
      attachment_roster: null,
      error: 'recipient_or_roster_changed',
    })
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })

  it('serves both formats privately and checks current role, department, and expiry', async () => {
    await runWeeklyReports()
    const reportId = (await job()).report_id as string
    const pdf = await prepareDepartmentReportDownload(reportId, 'pdf')
    expect(pdf.status).toBe(200)
    expect(pdf.headers.get('cache-control')).toBe('private, no-store')
    expect(await pdf.text()).toBe('%PDF-test')
    const excel = await prepareDepartmentReportDownload(reportId, 'xlsx')
    expect(excel.headers.get('content-disposition')).toContain('.xlsx')
    expect(new Uint8Array(await excel.arrayBuffer()).slice(0, 2)).toEqual(
      Uint8Array.of(80, 75),
    )
    mocks.session.mockResolvedValue({ user: { id: 'u2' } })
    expect(
      (await prepareDepartmentReportDownload(reportId, 'pdf')).status,
    ).toBe(404)
    mocks.session.mockResolvedValue(null)
    expect(await getAccessibleDepartmentReport(reportId)).toEqual({
      status: 'signed_out',
    })
    mocks.session.mockResolvedValue({ user: { id: 'u1' } })
    await pool.query(
      "update workspace_members set workspace_role_id = 'employee' where id = 'm1'",
    )
    expect(
      (await prepareDepartmentReportDownload(reportId, 'xlsx')).status,
    ).toBe(404)
    await expect(getWeeklyReportPreferences()).rejects.toThrow()
    await pool.query(
      "update workspace_members set workspace_role_id = 'r1', department_id = 'other' where id = 'm1'",
    )
    expect(
      (await prepareDepartmentReportDownload(reportId, 'pdf')).status,
    ).toBe(404)
    await pool.query(`update workspace_members set department_id = 'd1' where id = 'm1';
      update weekly_department_reports set expires_at = now();`)
    vi.stubEnv('WEEKLY_REPORT_EMAILS_ENABLED', 'false')
    expect(
      (await prepareDepartmentReportDownload(reportId, 'pdf')).status,
    ).toBe(404)
  })
})
