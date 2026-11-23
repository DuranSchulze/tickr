import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { db } from '#/db'

/**
 * One Resend send budget shared by every scheduled email worker (weekly and
 * daily reports), stored in `weekly_report_throttle` so it holds across
 * concurrent cron invocations.
 */
export async function ensureResendThrottle() {
  await db.execute(
    sql`insert into weekly_report_throttle (id) values ('resend') on conflict do nothing`,
  )
}

/**
 * Cross-invocation rate reservation, never an unbounded in-memory queue.
 * Returns the wait in ms, or null when the next five seconds are already booked.
 */
export async function reserveSend(): Promise<number | null> {
  const result = await db.execute<{ wait_ms: number }>(sql`
    update weekly_report_throttle set next_allowed_at = greatest(next_allowed_at, now()) + interval '1 second'
    where id = 'resend' and next_allowed_at < now() + interval '5 seconds'
    returning greatest(0, extract(epoch from (next_allowed_at - interval '1 second' - now())) * 1000)::int as wait_ms`)
  return result.rows[0]?.wait_ms ?? null
}

export async function deferResendUntil(next: Date) {
  await db.execute(
    sql`update weekly_report_throttle set next_allowed_at = greatest(next_allowed_at, ${next.toISOString()}::timestamptz) where id = 'resend'`,
  )
}
