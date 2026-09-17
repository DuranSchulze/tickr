/**
 * Measures the real rendered contrast of the left-panel type against the live
 * ColorBends canvas: samples the pixels actually behind each text block by
 * screenshotting the panel with the content hidden, then composites the
 * headline/body scrim (a semi-transparent gradient) over those pixels.
 */
import { chromium } from 'playwright'
import sharp from 'sharp'

const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] })

const srgb = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const lum = ([r, g, b2]) =>
  0.2126 * srgb(r / 255) + 0.7152 * srgb(g / 255) + 0.0722 * srgb(b2 / 255)
const ratio = (a, b2) => {
  const [x, y] = [lum(a), lum(b2)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

const results = []
for (const mode of ['light', 'dark']) {
  const p = await (
    await b.newContext({ viewport: { width: 1440, height: 1000 } })
  ).newPage()
  await p.goto('http://localhost:3000/auth', { waitUntil: 'load' })
  await p.waitForTimeout(3000)
  await p.evaluate((m) => {
    const r = document.documentElement
    r.classList.remove('light', 'dark')
    r.classList.add(m)
  }, mode)
  await p.waitForTimeout(800)

  // Hide the text layer (and the scrim) so we can read the raw canvas pixels,
  // then screenshot the panel with the canvas frozen at a representative frame.
  const boxes = await p.evaluate(() => {
    const text = document.querySelector('aside > div.relative')
    const scrim = document.querySelector(
      'aside > div.absolute.inset-0.bg-gradient-to-br',
    )
    const grab = (sel) => {
      const el = document.querySelector(sel)
      const r = el.getBoundingClientRect()
      return {
        x: Math.round(r.x + 6),
        y: Math.round(r.y + 6),
        width: Math.round(r.width - 12),
        height: Math.round(r.height - 12),
      }
    }
    const out = {
      headline: grab('aside h2'),
      body: grab('aside p.m-0.mt-4'),
      label: grab('aside p.uppercase'),
      footer: grab('aside p:last-of-type'),
    }
    if (text) text.style.visibility = 'hidden'
    if (scrim) scrim.style.display = 'none'
    return out
  })
  await p.waitForTimeout(400)
  const shot = await p.screenshot({
    clip: { x: 0, y: 0, width: 720, height: 1000 },
  })
  const { data, info } = await sharp(shot)
    .raw()
    .toBuffer({ resolveWithObject: true })
  const png = { data, width: info.width, channels: info.channels }

  // Two scrims stack over the canvas: a diagonal (90 → 60 → 0) and a
  // horizontal (100 → 85 → 45). Composite them in order.
  const scrimRGB = mode === 'light' ? [253, 252, 252] : [29, 26, 24]
  const diagAlpha = (x, y) => {
    const t = Math.min(1, Math.max(0, (x / 720 + y / 1000) / 2))
    return t < 0.5
      ? 0.9 + (0.6 - 0.9) * (t / 0.5)
      : 0.6 + (0 - 0.6) * ((t - 0.5) / 0.5)
  }
  const horizAlpha = (x) => {
    const t = Math.min(1, Math.max(0, x / 720))
    return t < 0.5
      ? 1 + (0.85 - 1) * (t / 0.5)
      : 0.85 + (0.45 - 0.85) * ((t - 0.5) / 0.5)
  }
  const scrimAlphaAt = (x, y) => {
    const a1 = diagAlpha(x, y)
    const a2 = horizAlpha(x)
    return a1 + a2 * (1 - a1)
  }
  const textRGB = mode === 'light' ? [0, 0, 0] : [245, 243, 241]
  // body copy uses text-smoke / graphite
  const smokeRGB = mode === 'light' ? [119, 113, 105] : [168, 162, 154]

  for (const [name, box] of Object.entries(boxes)) {
    if (box.width <= 0 || box.height <= 0) continue
    let worst = Infinity
    let samples = 0
    for (let y = box.y; y < box.y + box.height; y += 3) {
      for (let x = box.x; x < box.x + box.width; x += 3) {
        const i = (png.width * y + x) * png.channels
        const a = scrimAlphaAt(x, y)
        const composited = [0, 1, 2].map(
          (k) => png.data[i + k] * (1 - a) + scrimRGB[k] * a,
        )
        samples++
        const useSmoke =
          name === 'body' || name === 'footer' || name === 'label'
        const fg = useSmoke ? smokeRGB : textRGB
        const r = ratio(composited, fg)
        if (r < worst) worst = r
      }
    }
    results.push({
      mode,
      block: name,
      worstRatio: Number(worst.toFixed(2)),
      samples,
      passAA: worst >= 4.5,
      passLargeAA: worst >= 3,
    })
  }
  await p.close()
}

for (const r of results) {
  console.log(
    `${r.mode.padEnd(5)} ${r.block.padEnd(9)} worst ${String(r.worstRatio).padStart(5)}:1  AA-normal ${r.passAA ? 'PASS' : 'fail'}  AA-large ${r.passLargeAA ? 'PASS' : 'fail'}  (${r.samples} px)`,
  )
}
await b.close()
