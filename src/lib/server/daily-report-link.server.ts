import '@tanstack/react-start/server-only'
import { jwtVerify, SignJWT } from 'jose'
import { isValidDateKey } from '#/lib/time-tracker/timesheet'
import type { DailyReportScope } from '#/lib/time-tracker/daily-report-link'

/**
 * Daily report links are signed, so no report row has to be stored. The token
 * only names what the report covers; whoever opens it must still be signed in
 * and currently allowed to see that scope.
 */
export type DailyReportLink = {
  workspaceId: string
  scope: DailyReportScope
  /** Department id for `department`, member id for `member`, workspace id otherwise. */
  targetId: string
  date: string
}

const AUDIENCE = 'daily-report'
const LINK_LIFETIME = '90d'

function signingKey() {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('Daily report links require BETTER_AUTH_SECRET')
  return new TextEncoder().encode(`${secret}:daily-report-link:v1`)
}

export async function signDailyReportLink(link: DailyReportLink) {
  return new SignJWT({
    w: link.workspaceId,
    s: link.scope,
    i: link.targetId,
    d: link.date,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(LINK_LIFETIME)
    .sign(signingKey())
}

export async function verifyDailyReportLink(
  token: string,
): Promise<DailyReportLink | null> {
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      algorithms: ['HS256'],
      audience: AUDIENCE,
    })
    const { w, s, i, d } = payload
    if (
      typeof w !== 'string' ||
      typeof i !== 'string' ||
      typeof d !== 'string' ||
      !isValidDateKey(d) ||
      (s !== 'member' && s !== 'department' && s !== 'workspace')
    )
      return null
    return { workspaceId: w, scope: s, targetId: i, date: d }
  } catch {
    return null
  }
}
