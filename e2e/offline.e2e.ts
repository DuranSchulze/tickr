/**
 * Offline end-to-end check (offline-mode check C17) in a real browser with the
 * real service worker, against a running production build.
 *
 *   pnpm build && node .output/server/index.mjs   (on a NON-production DB)
 *   E2E_BASE_URL=http://localhost:3100 \
 *   E2E_DATABASE_URL=<same database> E2E_DATABASE_HOST_PREFIX=<its host prefix> \
 *   pnpm test:e2e
 *
 * Creates one synthetic member, workspace, client, project and tag. Refuses
 * any database whose host does not start with E2E_DATABASE_HOST_PREFIX.
 */
import { chromium } from 'playwright'
import type { Page } from 'playwright'
import { Client } from 'pg'

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3100'
const results: Array<{ step: string; ok: boolean; detail: string }> = []

function record(step: string, ok: boolean, detail = '') {
  results.push({ step, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${detail ? ` — ${detail}` : ''}`)
}

function databaseUrl(): string {
  const url = process.env.E2E_DATABASE_URL
  const prefix = process.env.E2E_DATABASE_HOST_PREFIX
  if (!url || !prefix) {
    throw new Error('Set E2E_DATABASE_URL and E2E_DATABASE_HOST_PREFIX.')
  }
  const host = new URL(url).hostname
  if (!host.startsWith(prefix)) {
    throw new Error(`Refusing to use ${host}: not ${prefix}*`)
  }
  return url
}

async function liveStatus(page: Page) {
  return (
    (await page
      .locator('[data-sync-status]')
      .first()
      .textContent()
      .catch(() => '')) ?? ''
  )
}

async function waitForStatus(page: Page, pattern: RegExp, timeoutMs: number) {
  const until = Date.now() + timeoutMs
  let last = ''
  while (Date.now() < until) {
    last = await liveStatus(page)
    if (pattern.test(last)) return { ok: true, last }
    await page.waitForTimeout(250)
  }
  return { ok: false, last }
}

/** True once the shell is cached and the snapshot + tracker cache are stored. */
async function offlineReady(page: Page) {
  return page.evaluate(async () => {
    const shell = await caches.match('/app/time-tracker?offline-shell=1')
    const count = await new Promise<number>((resolve) => {
      const open = indexedDB.open('trackly-offline')
      open.onsuccess = () => {
        const db = open.result
        if (!db.objectStoreNames.contains('cache')) return resolve(0)
        const req = db.transaction('cache').objectStore('cache').count()
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(0)
      }
      open.onerror = () => resolve(0)
    })
    const registration = await navigator.serviceWorker.getRegistration()
    return {
      controlled: !!navigator.serviceWorker.controller,
      worker: registration
        ? (registration.active?.state ??
          registration.waiting?.state ??
          registration.installing?.state ??
          'none')
        : 'unregistered',
      caches: await caches.keys(),
      shell: !!shell,
      cacheRecords: count,
    }
  })
}

async function main() {
  const db = new Client({ connectionString: databaseUrl() })
  await db.connect()
  const browser = await chromium.launch()
  const context = await browser.newContext({
    baseURL,
    serviceWorkers: 'allow',
    viewport: { width: 1280, height: 900 },
  })
  const stamp = Date.now()
  const email = `offline-e2e+${stamp}@tickr-offline-test.dev`
  let memberId = ''

  try {
    // ── Setup: synthetic member, workspace and catalogs ──────────────────────
    const signUp = await context.request.post('/api/auth/sign-up/email', {
      headers: { Origin: baseURL },
      data: { email, password: `Offline-${stamp}-pw`, name: 'Offline E2E' },
    })
    if (!signUp.ok()) throw new Error(`Sign-up failed: ${signUp.status()}`)
    const page = await context.newPage()
    await page.goto('/onboarding')
    const createButton = page.getByRole('button', {
      name: /Create a workspace/,
    })
    if (
      !(await createButton.isVisible({ timeout: 15_000 }).catch(() => false))
    ) {
      const text = (await page.locator('body').innerText()).slice(0, 500)
      throw new Error(
        `Onboarding did not offer a workspace at ${page.url()}: ${text}`,
      )
    }
    await createButton.click()
    await page.getByPlaceholder('Acme Inc.').fill(`Offline E2E ${stamp}`)
    await page.getByRole('button', { name: 'Create workspace' }).click()
    await page.waitForURL(/\/app\//, { timeout: 30_000 })

    const { rows } = await db.query<{ id: string; workspace_id: string }>(
      `select wm.id, wm.workspace_id from workspace_members wm
         join users u on u.id = wm.user_id where u.email = $1 limit 1`,
      [email],
    )
    if (!rows[0]) throw new Error('Workspace was not created')
    memberId = rows[0].id
    const workspaceId = rows[0].workspace_id
    const id = (s: string) => `e2e${stamp}${s}`.slice(0, 30)
    await db.query(
      `insert into clients (id, workspace_id, name) values ($1, $2, 'E2E Client')`,
      [id('c'), workspaceId],
    )
    await db.query(
      `insert into projects (id, workspace_id, client_id, name) values ($1, $2, $3, 'E2E Project')`,
      [id('p'), workspaceId, id('c')],
    )
    await db.query(
      `insert into tags (id, workspace_id, name) values ($1, $2, 'E2E Tag')`,
      [id('t'), workspaceId],
    )
    console.log(`setup: member ${memberId} in workspace ${workspaceId}`)

    // ── Online visits prime the shell, snapshot and cache ────────────────────
    await page.goto('/app/timesheet')
    await page.waitForLoadState('networkidle')
    await page.goto('/app/time-tracker')
    await page.waitForLoadState('networkidle')
    let ready = await offlineReady(page)
    for (let i = 0; i < 40 && !(ready.shell && ready.cacheRecords >= 2); i++) {
      await page.waitForTimeout(500)
      if (i === 10 && !ready.controlled) await page.reload()
      ready = await offlineReady(page)
    }
    record(
      'Online visit caches the neutral shell and the encrypted snapshot',
      ready.shell && ready.cacheRecords >= 2,
      JSON.stringify(ready),
    )

    // The cached shell must not contain this member's data (decision Q2).
    const shellText = await page.evaluate(async () => {
      const res = await caches.match('/app/time-tracker?offline-shell=1')
      return res ? res.text() : ''
    })
    record(
      'Cached shell holds no user data',
      shellText.length > 0 &&
        !shellText.includes(email) &&
        !shellText.includes('E2E Project') &&
        !shellText.includes('Offline E2E'),
    )

    // ── Offline reload opens the tracker ─────────────────────────────────────
    await context.setOffline(true)
    const t0 = Date.now()
    await page.reload()
    const banner = page.getByText('You are offline.', { exact: false })
    const opened = await banner
      .waitFor({ timeout: 10_000 })
      .then(() => true)
      .catch(() => false)
    const openMs = Date.now() - t0
    record(
      'Offline reload opens the tracker with the offline banner (≤ 3 s)',
      opened && openMs <= 3000,
      `${openMs} ms`,
    )
    record(
      'Never redirected to onboarding offline',
      !page.url().includes('/onboarding'),
      page.url(),
    )
    const offlineStatus = await waitForStatus(page, /^Offline/, 10_000)
    record('Pill reports offline', offlineStatus.ok, offlineStatus.last)

    // ── Capture offline: start and stop a timer ──────────────────────────────
    const description = page
      .getByLabel('Task description')
      .locator('visible=true')
      .first()
    if (
      !(await description.isVisible({ timeout: 10_000 }).catch(() => false))
    ) {
      await page.screenshot({
        path: `${process.env.E2E_ARTIFACTS ?? '.'}/offline-tracker.png`,
      })
      const text = (await page.locator('body').innerText()).slice(0, 800)
      throw new Error(`Tracker not usable offline at ${page.url()}:
${text}`)
    }
    await description.fill('Offline site visit')
    await page
      .getByRole('button', { name: /Client \/ Project/ })
      .locator('visible=true')
      .first()
      .click()
    await page
      .getByLabel('Search clients, projects or tasks')
      .fill('E2E Project')
    await page
      .getByText('E2E Project', { exact: true })
      .locator('visible=true')
      .first()
      .click()
    await page
      .getByText('No tag', { exact: true })
      .locator('visible=true')
      .first()
      .click()
    await page
      .getByText('E2E Tag', { exact: true })
      .locator('visible=true')
      .first()
      .click()
    await page.keyboard.press('Escape')
    await page
      .getByRole('button', { name: /Start timer/ })
      .locator('visible=true')
      .first()
      .click()
    await page.waitForTimeout(2500)
    await page
      .getByRole('button', { name: /Stop timer/ })
      .locator('visible=true')
      .first()
      .click()
    const pending = await waitForStatus(page, /2 pending/, 10_000)
    record(
      'Offline start + stop are saved locally (2 pending)',
      pending.ok,
      pending.last,
    )

    // ── Offline navigation to the own timesheet ──────────────────────────────
    await page.goto('/app/timesheet')
    const sheet = await page
      .getByText('Offline E2E', { exact: false })
      .first()
      .waitFor({ timeout: 10_000 })
      .then(() => true)
      .catch(() => false)
    record('Own timesheet opens offline', sheet, page.url())
    await page.goto('/app/analytics')
    const onlineRequired = await page
      .getByText('Online required', { exact: false })
      .first()
      .waitFor({ timeout: 10_000 })
      .then(() => true)
      .catch(() => false)
    record('Analytics shows "Online required" offline', onlineRequired)
    await page.goto('/app/time-tracker')
    await waitForStatus(page, /2 pending/, 10_000)

    // ── Reconnect: replay, exactly one entry ─────────────────────────────────
    await context.setOffline(false)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    const synced = await waitForStatus(page, /Synced/, 45_000)
    record(
      'Reconnect syncs the queue (pill shows Synced)',
      synced.ok,
      synced.last,
    )
    const entries = await db.query<{ total: number; replayed: number }>(
      `select count(*)::int total, count(client_mutation_id)::int replayed
         from time_entries where workspace_member_id = $1`,
      [memberId],
    )
    record(
      'Exactly one server entry, created by idempotent replay',
      entries.rows[0].total === 1 && entries.rows[0].replayed === 1,
      JSON.stringify(entries.rows[0]),
    )
  } finally {
    await browser.close()
    await db.end()
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exitCode = failed.length ? 1 : 0
}

void main().catch((err: unknown) => {
  console.error(err)
  process.exitCode = 1
})
