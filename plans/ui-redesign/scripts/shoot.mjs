/**
 * Throwaway visual-QA helper for the editorial redesign (PLAN.md Phases 1/9).
 * Usage: node plans/ui-redesign/scripts/shoot.mjs <outDir> [path::mode ...]
 *   path  — route to visit, e.g. "/" or "/app/time-tracker"
 *   mode  — optional "dark" to force the dark palette
 * Routes that need auth are skipped by the caller; this only captures.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const [, , outDir = 'plans/ui-redesign/shots', ...targets] = process.argv
mkdirSync(outDir, { recursive: true })

const base = process.env.BASE_URL ?? 'http://localhost:3000'

/** Freeze entrance/reveal/stagger motion so captures show the settled state. */
const FREEZE_CSS =
  '*,*::before,*::after{animation:none !important;transition:none !important;opacity:1 !important;filter:none !important;transform:none !important}'
const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
})
const page = await ctx.newPage()

for (const target of targets) {
  const [path, mode] = target.split('::')
  try {
    await page.goto(base + path, { waitUntil: 'load', timeout: 20000 })

    // Entrance/reveal animations would otherwise be captured mid-flight.
    // `waitUntil: 'load'` fires before React hydrates, so wait for the app to
    // actually mount before freezing — otherwise the freeze is applied to a
    // tree that is replaced on hydration and the capture lands mid-animation.
    await page
      .waitForFunction(
        () => {
          const b = document.body
          return b && b.innerText.trim().length > 0
        },
        { timeout: 20000 },
      )
      .catch(() => {})
    await page.waitForTimeout(900)
    await page.addStyleTag({ content: FREEZE_CSS })
    await page.waitForTimeout(250)

    if (mode === 'dark') {
      await page.evaluate(() => {
        const root = document.documentElement
        root.classList.remove('light')
        root.classList.add('dark')
      })
      await page.waitForTimeout(500)
    }
    const name =
      (path.replace(/[^a-z0-9]/gi, '_') || 'root') +
      (mode ? `_${mode}` : '') +
      '.png'
    await page.screenshot({ path: `${outDir}/${name}` })
    console.log('ok', name)
  } catch (error) {
    console.log('FAIL', target, String(error).slice(0, 140))
  }
}

await browser.close()
