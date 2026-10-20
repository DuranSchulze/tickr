/** Run with WEEKLY_REPORT_TEST_DATABASE_URL pointing to a disposable LOCAL Postgres. */
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
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

import { runWeeklyReports } from '../tracker/weekly-reports.server'
import {
  getWeeklyReportPreferences,
  updateWeeklyReportPreferences,
} from '../weekly-report-preferences.server'
import { WeeklyEmailError } from '../mailer'

import type * as MailerModule from '../mailer'

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  report: vi.fn(),
  pdf: vi.fn(),
  send: vi.fn(),
  access: vi.fn(),
}))
vi.mock('@tanstack/react-start/server-only', () => ({}))
vi.mock('#/db', () => ({ db: { execute: mocks.execute } }))
vi.mock('../tracker/member-report.server', () => ({
  buildMemberReport: mocks.report,
}))
vi.mock('#/lib/time-tracker/member-report-export', () => ({
  buildWeeklyMemberReportPdf: mocks.pdf,
}))
vi.mock('../workspace-access.server', () => ({
  requireWorkspaceAccess: mocks.access,
}))
vi.mock('../mailer', async (importOriginal) => ({
  ...(await importOriginal<typeof MailerModule>()),
  sendWeeklyReportEmail: mocks.send,
}))

const url = process.env.WEEKLY_REPORT_TEST_DATABASE_URL
const suite = url ? describe : describe.skip
suite('weekly reports against PostgreSQL', () => {
  let pool: pg.Pool
  const schema = `weekly_test_${process.pid}`
  const fixedNow = '2026-10-25T00:05:00Z'
  const dialect = new PgDialect()
  beforeAll(async () => {
    const parsed = new URL(url!)
    if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))
      throw new Error('Tests require disposable localhost PostgreSQL')
    pg.types.setTypeParser(1082, (value) => value)
    pool = new pg.Pool({
      connectionString: url,
      options: `-c search_path=${schema},pg_catalog`,
    })
    await pool.query(`create schema ${schema}`)
    await pool.query(
      `create function ${schema}.now() returns timestamptz language sql stable as $$select '${fixedNow}'::timestamptz$$`,
    )
    await pool.query(`create table workspaces (id varchar(30) primary key, name text not null, timezone text not null);
      create table users (id varchar(30) primary key, email text not null);
      create table workspace_members (id varchar(30) primary key, workspace_id varchar(30) not null references workspaces(id),
        user_id varchar(30) references users(id), status text not null default 'ACTIVE', updated_at timestamptz default now());`)
    const migration = readFileSync(
      'drizzle/0026_weekly_personal_reports.sql',
      'utf8',
    ).replaceAll('"public".', `"${schema}".`)
    await pool.query(migration)
  })
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
      'truncate weekly_report_jobs, weekly_report_schedules, weekly_report_throttle, workspace_members, users, workspaces cascade',
    )
    await pool.query(`insert into workspaces values ('w1','Workspace One','Asia/Manila'),('w2','Workspace Two','Asia/Manila');
      insert into users values ('u1','me@example.com'),('u2','other@example.com');
      insert into workspace_members (id,workspace_id,user_id,weekly_report_enabled_at) values
        ('m1','w1','u1','2026-10-01'),('m2','w2','u2','2026-10-01');
      insert into weekly_report_schedules (workspace_id,timezone,due_at) values ('w1','Asia/Manila','2026-10-25T00:00:00Z');`)
    mocks.report.mockReset().mockResolvedValue({
      entries: [{ id: 'entry' }],
      summary: { totalSeconds: 3600 },
    })
    mocks.pdf
      .mockReset()
      .mockResolvedValue(new TextEncoder().encode('%PDF-test'))
    mocks.send
      .mockReset()
      .mockResolvedValue({ provider: 'resend', id: 'provider-1' })
    mocks.access.mockReset().mockResolvedValue({
      member: { id: 'm1' },
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
      await pool.query('select * from weekly_report_jobs order by id limit 1')
    ).rows[0]
  }
  it('isolates workspace/member data, attaches a PDF, and deduplicates subsequent invocations', async () => {
    await runWeeklyReports()
    expect(mocks.report).toHaveBeenCalledWith({
      workspaceId: 'w1',
      memberId: 'm1',
      startDate: '2026-10-18',
      endDate: '2026-10-24',
      timezone: 'Asia/Manila',
    })
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'me@example.com',
        attachments: [
          expect.objectContaining({
            filename: 'weekly-time-report-2026-10-18-to-2026-10-24.pdf',
          }),
        ],
      }),
      'weekly-report/w1:m1:2026-10-18',
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
      ).rows[0].due_at.toISOString(),
    ).toBe('2026-11-01T00:00:00.000Z')
  })
  it('skips empty weeks', async () => {
    mocks.report.mockResolvedValue({ entries: [] })
    await runWeeklyReports()
    expect(await job()).toMatchObject({
      status: 'skipped',
      error: 'empty_week',
      payload: null,
    })
    expect(mocks.send).not.toHaveBeenCalled()
  })
  it('freezes content on a rate-limit failure and reuses identical content on retry', async () => {
    mocks.send.mockRejectedValueOnce(new WeeklyEmailError('retryable', 120))
    await runWeeklyReports()
    const first = await job()
    expect(first.status).toBe('retryable_failure')
    expect(first.payload.to).toBe('me@example.com')
    // Advance server eligibility and JS retry clock independently of the schedule.
    await pool.query(
      'update weekly_report_jobs set next_attempt_at=now(); update weekly_report_throttle set next_allowed_at=now()',
    )
    await runWeeklyReports()
    expect(mocks.report).toHaveBeenCalledTimes(1)
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
  it('rejects oversized attachments without sending', async () => {
    mocks.pdf.mockResolvedValue(new Uint8Array(10 * 1024 * 1024 + 1))
    await runWeeklyReports()
    expect(await job()).toMatchObject({
      status: 'terminal_failure',
      error: 'attachment_too_large',
    })
    expect(mocks.send).not.toHaveBeenCalled()
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
        'select id, weekly_report_email_enabled from workspace_members order by id',
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
    await pool.query(`insert into weekly_report_jobs (id,workspace_id,member_id,week_start,week_end,timezone,due_at,status,attempts,lease_until)
      values ('crashed','w2','m2','2026-10-18','2026-10-24','Asia/Manila','2026-10-25T00:00Z','processing',1,now()-interval '1 minute')`)
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
      member: { id: 'm2' },
      workspace: { id: 'w2', name: 'Workspace Two', timezone: 'Asia/Manila' },
      session: { user: { id: 'u1' } },
    })
    await expect(getWeeklyReportPreferences()).rejects.toThrow(
      'Active membership required',
    )
    await expect(updateWeeklyReportPreferences(false)).rejects.toThrow(
      'Active membership required',
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
  it('pages 251 members durably and preserves private jobs', async () => {
    await pool.query(`insert into users select 'bulk-u-'||i, 'bulk-'||i||'@example.com' from generate_series(1,250) i;
      insert into workspace_members (id,workspace_id,user_id,weekly_report_enabled_at)
      select 'bulk-m-'||lpad(i::text,3,'0'), 'w1','bulk-u-'||i,'2026-10-01' from generate_series(1,250) i;`)
    mocks.report.mockResolvedValue({ entries: [] })
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
  })
})
