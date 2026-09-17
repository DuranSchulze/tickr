import { chromium } from 'playwright'
const base = process.env.BASE_URL ?? 'http://localhost:3000'
const b = await chromium.launch()
const p = await (
  await b.newContext({ viewport: { width: 1440, height: 1000 } })
).newPage()
const read = () =>
  p.evaluate(() => {
    const pill = document.querySelector('.t-tabs-pill')
    const tabs = [...document.querySelectorAll('.t-tab')]
    const pr = pill.getBoundingClientRect()
    return {
      pill: {
        x: Math.round(pr.x),
        y: Math.round(pr.y),
        w: Math.round(pr.width),
        h: Math.round(pr.height),
        transform: pill.style.transform,
        width: pill.style.width,
      },
      tabs: tabs.map((t) => {
        const r = t.getBoundingClientRect()
        return {
          label: t.textContent.trim(),
          sel: t.getAttribute('aria-selected'),
          x: Math.round(r.x),
          w: Math.round(r.width),
        }
      }),
      bar: document.querySelector('.t-tabs').getBoundingClientRect().x,
    }
  })
const aligned = (d) => {
  const active = d.tabs.find((t) => t.sel === 'true')
  return (
    active &&
    Math.abs(d.pill.x - active.x) <= 1 &&
    Math.abs(d.pill.w - active.w) <= 1
  )
}
await p.goto(base + '/auth', { waitUntil: 'load' })
await p.waitForSelector('.t-tab', { timeout: 30000 })
await p.waitForTimeout(1200)
const a = await read()
console.log('1. initial:', JSON.stringify(a))
console.log('   pill aligned to active tab:', aligned(a))
await p.click('.t-tab:nth-of-type(2)')
await p.waitForTimeout(80)
const mid = await read()
console.log('\n2. ~80ms mid-flight:', JSON.stringify(mid.pill))
await p.waitForTimeout(600)
const c = await read()
console.log('\n3. settled:', JSON.stringify(c))
console.log('   pill aligned to signup tab:', aligned(c))
console.log(
  '\n4. stagger:',
  JSON.stringify(
    await p.evaluate(() =>
      [...document.querySelectorAll('.t-stagger > *')].map((el) => ({
        i: el.style.getPropertyValue('--stagger-i'),
        anim: getComputedStyle(el).animationName,
        delay: getComputedStyle(el).animationDelay,
      })),
    ),
  ),
)
const rm = await b.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce',
})
const rp = await rm.newPage()
await rp.goto(base + '/auth', { waitUntil: 'load' })
await rp.waitForSelector('.t-tab', { timeout: 30000 })
console.log(
  '\n5. reduced motion pill transition:',
  await rp.evaluate(
    () =>
      getComputedStyle(document.querySelector('.t-tabs-pill'))
        .transitionDuration,
  ),
)
await p.screenshot({ path: '/tmp/shots/auth-tabs-signup.png' })
await b.close()
