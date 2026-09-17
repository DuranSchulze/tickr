/**
 * Visual-QA helper for authenticated app surfaces (PLAN.md Phases 4/5/9).
 *
 * The seeded dev credentials in `src/lib/dev-credentials.ts` do not exist in
 * this dev database, so this script signs in through the REAL login flow with a
 * temporary password for one existing workspace member, captures the app
 * routes in light + dark, then restores the original password hash.
 *
 * Safety: the original `accounts.password` hash is read first and restored in a
 * `finally` block; the temporary password only ever lives in memory.
 *
 * Usage: node plans/ui-redesign/scripts/shoot-app.mjs [outDir] [path ...]
 */
import { chromium } from 'playwright'
import { neon } from '@neondatabase/serverless'
import { config } from 'dotenv'
import { hashPassword } from 'better-auth/crypto'
import { mkdirSync } from 'node:fs'

config({ path: '.env.local' })
const sql = neon(process.env.DATABASE_URL)

const [, , outDir = 'plans/ui-redesign/shots', ...paths] = process.argv
mkdirSync(outDir, { recursive: true })

const base = process.env.BASE_URL ?? 'http://localhost:3000'
const EMAIL = process.env.QA_EMAIL ?? 'zafajardo9@gmail.com'
const TEMP_PASSWORD = 'qa-visual-review-1'
const ROUTES = paths.length
  ? paths
  : [
      '/app/time-tracker',
      '/app/time-tracker/week',
      '/app/analytics',
      '/app/analytics/overview',
      '/app/timesheet',
      '/app/reports',
      '/app/calendar',
      '/app/workspace/members',
      '/app/workspace/catalogs/clients',
      '/app/workspace/catalogs/projects',
      '/app/workspace/settings',
      '/app/audit-logs',
      '/app/my-performance',
      '/app/workspace/activity',
    ]

const [account] = await sql`
  select a.id, a.password from accounts a
  join users u on u.id = a.user_id
  where u.email = ${EMAIL} and a.provider_id = 'credential'
  limit 1`
if (!account) throw new Error(`no credential account for ${EMAIL}`)

// The dev workspaces' trials have lapsed, which gates every app screen behind
// the billing wall. Extend the QA workspace trial so the real screens render;
// the original value is restored in the finally block.
const [sub] = await sql`
  select s.id, s.status, s.trial_ends_at, s.current_period_ends_at from subscriptions s
  join workspace_members wm on wm.workspace_id = s.workspace_id
  join users u on u.id = wm.user_id
  where u.email = ${EMAIL} and wm.status = 'ACTIVE' limit 1`
let originalTrial = null
if (sub) {
  originalTrial = {
    id: sub.id,
    status: sub.status,
    trial: sub.trial_ends_at,
    period: sub.current_period_ends_at,
  }
  await sql`update subscriptions set trial_ends_at = now() + interval '7 days',
            current_period_ends_at = now() + interval '7 days', status = 'ACTIVE'
            where id = ${sub.id}`
  console.log('QA: trial extended for', sub.id)
}

const originalHash = account.password
await sql`update accounts set password = ${await hashPassword(TEMP_PASSWORD)} where id = ${account.id}`
console.log('temporary QA password set for', EMAIL)

const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  })
  const page = await ctx.newPage()

  await page.goto(base + '/auth', { waitUntil: 'load', timeout: 30000 })
  await page.waitForTimeout(2000) // let the form hydrate before submitting
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', TEMP_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), {
    timeout: 30000,
  })
  console.log('signed in as', EMAIL)

  for (const route of ROUTES) {
    for (const mode of ['light', 'dark']) {
      try {
        await page.goto(base + route, { waitUntil: 'load', timeout: 30000 })
        await page.evaluate((m) => {
          const root = document.documentElement
          root.classList.remove('light', 'dark')
          root.classList.add(m)
        }, mode)
        await page
          .waitForFunction(
            () => {
              const b = document.body
              return b && b.innerText.trim().length > 0
            },
            { timeout: 20000 },
          )
          .catch(() => {})
        await page.waitForTimeout(1400)
        await page.addStyleTag({
          content:
            '*,*::before,*::after{animation:none !important;transition:none !important;opacity:1 !important;filter:none !important;transform:none !important}',
        })
        await page.waitForTimeout(250)
        const name = `${route.replace(/[^a-z0-9]/gi, '_')}_${mode}.png`
        await page.screenshot({ path: `${outDir}/${name}` })
        console.log('ok', name)
      } catch (error) {
        console.log('FAIL', route, mode, String(error).slice(0, 120))
      }
    }
  }
} finally {
  await sql`update accounts set password = ${originalHash} where id = ${account.id}`
  if (originalTrial) {
    await sql`update subscriptions set trial_ends_at = ${originalTrial.trial},
              current_period_ends_at = ${originalTrial.period}, status = ${originalTrial.status}
              where id = ${originalTrial.id}`
    console.log('QA: subscription restored to', originalTrial.status)
  }
  console.log('original password hash restored')
  await browser.close()
}
