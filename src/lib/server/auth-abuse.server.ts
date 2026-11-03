import '@tanstack/react-start/server-only'
import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'
import { inArray, sql } from 'drizzle-orm'
import { db } from '#/db'
import { authAbuseCounters } from '#/db/schema'
import { readClientIp } from './client-ip.server'

/**
 * Shared authentication abuse counters.
 *
 * Production defaults to enforcement; development defaults to observation.
 * Both browser and public API credential checks share these database buckets.
 */

/** Fixed observation window for every counter, in seconds. */
export const ABUSE_WINDOW_SECONDS = 15 * 60

/** Failed attempts per (account, source IP) before a cooldown starts. */
export const ABUSE_ACCOUNT_IP_LIMIT = 5

/** Failed attempts per account across all source IPs before the interim pause. */
export const ABUSE_ACCOUNT_LIMIT = 10

/** Authentication requests per source IP per window. */
export const ABUSE_IP_LIMIT = 100

/** Retry delay for temporarily unavailable counter storage. */
const STORAGE_RETRY_SECONDS = 30

export type AuthAbuseMode = 'off' | 'shadow' | 'enforce'

export type AuthAbuseOperation =
  | 'login'
  | 'developer_login'
  | 'register'
  | 'recovery'
  | 'join_code'

type AbuseLimitReason = 'account_ip' | 'account' | 'ip'

export type AuthAbuseReason =
  | 'ok'
  | 'disabled'
  | 'shadow'
  | 'unavailable'
  | AbuseLimitReason

export type AuthAbuseCounts = {
  accountIp: number
  account: number
  ip: number
}

export type AuthAbuseDecision = {
  admitted: boolean
  mode: AuthAbuseMode
  reason: AuthAbuseReason
  /** True when a threshold was crossed, regardless of whether it was enforced. */
  wouldBlock: boolean
  retryAfterSeconds: number
}

export type AuthAbuseAttempt = AuthAbuseDecision & {
  /** Buckets cleared when this attempt succeeds. Empty when tracking is off. */
  resetBuckets: string[]
}

export type AbuseBucketSet = {
  accountIp: string | null
  account: string | null
  ip: string | null
}

const BUCKET_SCOPE = {
  account_ip: 'account_ip',
  account: 'account',
  ip: 'ip',
} as const

/**
 * Defaults to enforcement in production and observation in development.
 */
export function resolveAuthAbuseMode(): AuthAbuseMode {
  const raw = process.env.AUTH_ABUSE_MODE?.trim().toLowerCase()
  if (raw === 'off' || raw === 'shadow' || raw === 'enforce') return raw
  return process.env.NODE_ENV === 'production' ? 'enforce' : 'shadow'
}

/**
 * Derives the HMAC bucket keys for one attempt.
 *
 * Identifiers are hashed with a dedicated secret so the counters never store a
 * raw email address or IP. `account_ip` is the primary signal; `account` exists
 * for distributed guessing across IPs; `ip` bounds aggregate request volume.
 */
export function buildAbuseBuckets(input: {
  secret: string
  operation: AuthAbuseOperation
  email?: string | null
  ip?: string | null
}): AbuseBucketSet {
  const email = input.email?.trim().toLowerCase() || null
  const ip = normalizeIp(input.ip)
  const hash = (scope: string, identifier: string) =>
    createHmac('sha256', input.secret)
      .update(`auth-abuse:${scope}:${input.operation}:${identifier}`)
      .digest('hex')

  return {
    accountIp: email
      ? hash(BUCKET_SCOPE.account_ip, `${email}|${ip ?? 'noip'}`)
      : null,
    account: email ? hash(BUCKET_SCOPE.account, email) : null,
    ip: ip ? hash(BUCKET_SCOPE.ip, ip) : null,
  }
}

/**
 * Pure admission policy. Kept separate from storage so the thresholds can be
 * unit-tested without a database.
 */
export function evaluateAdmission(
  mode: AuthAbuseMode,
  counts: AuthAbuseCounts,
): AuthAbuseDecision {
  if (mode === 'off') {
    return {
      admitted: true,
      mode,
      reason: 'disabled',
      wouldBlock: false,
      retryAfterSeconds: 0,
    }
  }

  const exceeded = firstExceeded(counts)
  if (!exceeded) {
    return {
      admitted: true,
      mode,
      reason: 'ok',
      wouldBlock: false,
      retryAfterSeconds: 0,
    }
  }

  const retryAfterSeconds = ABUSE_WINDOW_SECONDS

  if (mode === 'shadow') {
    return {
      admitted: true,
      mode,
      reason: 'shadow',
      wouldBlock: true,
      retryAfterSeconds,
    }
  }

  return {
    admitted: false,
    mode,
    reason: exceeded,
    wouldBlock: true,
    retryAfterSeconds,
  }
}

/**
 * Atomically reserves one attempt across every applicable bucket and returns
 * the admission decision.
 *
 * The counters are incremented *before* password hashing so rejected traffic
 * cannot force expensive work. A successful credential clears the account
 * buckets afterwards via `recordAuthResult`.
 */
export async function reserveAuthAttempt(input: {
  operation: AuthAbuseOperation
  request: Request
  email?: string | null
  /** Test hook. Production reads `AUTH_ABUSE_MODE`. */
  mode?: AuthAbuseMode
}): Promise<AuthAbuseAttempt> {
  const mode = input.mode ?? resolveAuthAbuseMode()
  if (mode === 'off') return disabledAttempt(mode)

  const secret = (
    process.env.AUTH_ABUSE_HMAC_SECRET || process.env.BETTER_AUTH_SECRET
  )?.trim()
  if (!secret) {
    warnOnce(
      'missing-secret',
      '[auth-abuse] AUTH_ABUSE_HMAC_SECRET is not set; protected requests fail closed in enforcement mode.',
    )
    return {
      admitted: mode !== 'enforce',
      mode,
      reason: 'unavailable',
      wouldBlock: false,
      retryAfterSeconds: 30,
      resetBuckets: [],
    }
  }
  if (secret.length < 32) {
    warnOnce(
      'short-secret',
      '[auth-abuse] AUTH_ABUSE_HMAC_SECRET is shorter than 32 characters; use a longer random value.',
    )
  }

  const ip = normalizeIp(
    process.env.VERCEL === '1' || process.env.NODE_ENV !== 'production'
      ? readClientIp(input.request)
      : process.env.AUTH_TRUSTED_IP_HEADER
        ? input.request.headers
            .get(process.env.AUTH_TRUSTED_IP_HEADER)
            ?.split(',')[0]
        : null,
  )
  const buckets = buildAbuseBuckets({
    secret,
    operation: input.operation,
    email: input.email,
    ip,
  })
  const rows = toBucketRows(buckets)

  if (rows.length === 0) return disabledAttempt(mode)

  try {
    const counts = await bumpBuckets(rows, input.operation)
    const decision = evaluateAdmission(mode, counts)

    if (decision.wouldBlock) {
      // Never log the email or IP: only the non-reversible bucket counts.
      console.warn('[auth-abuse] threshold reached', {
        mode: decision.mode,
        operation: input.operation,
        reason: decision.reason,
        counts,
      })
    }

    return { ...decision, resetBuckets: resetBucketsFor(buckets) }
  } catch (error) {
    console.error('[auth-abuse] counter storage unavailable', error)
    // Never issue protected credentials when enforced counters cannot be read.
    return {
      admitted: mode !== 'enforce',
      mode,
      reason: 'unavailable',
      wouldBlock: false,
      retryAfterSeconds: STORAGE_RETRY_SECONDS,
      resetBuckets: [],
    }
  }
}

/**
 * Records the outcome of a reserved attempt. Only a success changes state; a
 * failure is already reflected by the reservation. Never throws.
 */
export async function recordAuthResult(
  attempt: AuthAbuseAttempt,
  outcome: 'success' | 'failure',
): Promise<void> {
  if (outcome !== 'success' || attempt.resetBuckets.length === 0) return

  try {
    await db
      .delete(authAbuseCounters)
      .where(inArray(authAbuseCounters.bucket, attempt.resetBuckets))
  } catch (error) {
    // A successful sign-in must never fail because counters could not be cleared.
    console.error('[auth-abuse] failed to clear counters after success', error)
  }
}

function firstExceeded(counts: AuthAbuseCounts): AbuseLimitReason | null {
  if (counts.accountIp > ABUSE_ACCOUNT_IP_LIMIT) return 'account_ip'
  if (counts.account > ABUSE_ACCOUNT_LIMIT) return 'account'
  if (counts.ip > ABUSE_IP_LIMIT) return 'ip'
  return null
}

function toBucketRows(
  buckets: AbuseBucketSet,
): Array<{ bucket: string; scope: string }> {
  const rows: Array<{ bucket: string; scope: string }> = []
  if (buckets.accountIp) {
    rows.push({ bucket: buckets.accountIp, scope: BUCKET_SCOPE.account_ip })
  }
  if (buckets.account) {
    rows.push({ bucket: buckets.account, scope: BUCKET_SCOPE.account })
  }
  if (buckets.ip) rows.push({ bucket: buckets.ip, scope: BUCKET_SCOPE.ip })
  return rows
}

/**
 * Single-statement upsert. The Neon HTTP driver has no interactive
 * transactions, so reservation and counter increment must be atomic within one
 * SQL statement — a read-then-write would let concurrent attempts undercount.
 */
async function bumpBuckets(
  rows: Array<{ bucket: string; scope: string }>,
  operation: AuthAbuseOperation,
): Promise<AuthAbuseCounts> {
  const now = new Date()
  const cutoff = new Date(now.getTime() - ABUSE_WINDOW_SECONDS * 1000)

  const updated = await db
    .insert(authAbuseCounters)
    .values(
      rows.map((row) => ({
        bucket: row.bucket,
        scope: row.scope,
        operation,
        windowStartedAt: now,
        count: 1,
        strikes: 0,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: authAbuseCounters.bucket,
      set: {
        // SET expressions read the pre-update row, so both CASE branches below
        // observe the same `window_started_at`.
        windowStartedAt: sql`CASE WHEN ${authAbuseCounters.windowStartedAt} <= ${cutoff} THEN ${now} ELSE ${authAbuseCounters.windowStartedAt} END`,
        count: sql`CASE WHEN ${authAbuseCounters.windowStartedAt} <= ${cutoff} THEN 1 ELSE ${authAbuseCounters.count} + 1 END`,
        updatedAt: now,
      },
    })
    .returning({
      bucket: authAbuseCounters.bucket,
      count: authAbuseCounters.count,
    })

  const byBucket = new Map(updated.map((row) => [row.bucket, row.count]))
  const counts: AuthAbuseCounts = { accountIp: 0, account: 0, ip: 0 }

  for (const row of rows) {
    const count = byBucket.get(row.bucket) ?? 1
    if (row.scope === BUCKET_SCOPE.account_ip) counts.accountIp = count
    else if (row.scope === BUCKET_SCOPE.account) counts.account = count
    else counts.ip = count
  }

  return counts
}

function resetBucketsFor(buckets: AbuseBucketSet): string[] {
  return [buckets.accountIp, buckets.account].filter(
    (bucket): bucket is string => bucket !== null,
  )
}

function disabledAttempt(mode: AuthAbuseMode): AuthAbuseAttempt {
  return {
    admitted: true,
    mode,
    reason: 'disabled',
    wouldBlock: false,
    retryAfterSeconds: 0,
    resetBuckets: [],
  }
}

function normalizeIp(value?: string | null): string | null {
  const trimmed = value?.trim()
  if (!trimmed || !isIP(trimmed)) return null
  return trimmed
}

const warnedKeys = new Set<string>()

function warnOnce(key: string, message: string): void {
  if (warnedKeys.has(key)) return
  warnedKeys.add(key)
  console.warn(message)
}
