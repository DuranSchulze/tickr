#!/usr/bin/env node
/**
 * Bundle performance gate.
 *
 * Measures the assets that `vite build` actually emitted into `.output/public` and
 * fails when they exceed the budgets in `perf/bundle-budget.config.json`.
 *
 * Two numbers matter:
 *   - initial JavaScript  — the chunks the TanStack Start manifest preloads for the
 *     root route, i.e. every page load. A regression here is felt by all users.
 *   - total JavaScript    — every emitted JS/CSS byte, lazy chunks included. A
 *     regression here means the deploy got heavier even if the entry did not.
 *
 * Usage:
 *   node perf/bundle-budget.mjs            # human-readable report; exit 1 on failure
 *   node perf/bundle-budget.mjs --json     # machine-readable report
 */

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_DIR = path.join(ROOT, '.output', 'public')
const ASSETS_DIR = path.join(PUBLIC_DIR, 'assets')
const SERVER_DIR = path.join(ROOT, '.output', 'server')
const CONFIG_PATH = path.join(ROOT, 'perf', 'bundle-budget.config.json')

const COMPRESSIBLE = /\.(js|css)$/
const gzipBytes = (buffer) => zlib.gzipSync(buffer, { level: 9 }).length
const kb = (bytes) => bytes / 1024
const round = (value) => Math.round(value * 10) / 10

/** Minimal glob: supports `*` (any run of characters) and `?` (one character). */
function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`)
}

function fail(message) {
  console.error(`\n[bundle-budget] ${message}\n`)
  process.exit(1)
}

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fail(`Missing budget file: ${path.relative(ROOT, CONFIG_PATH)}`)
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
}

/**
 * The generated TanStack Start manifest records, per route, the assets the server
 * tells the browser to preload. `__root__` is the set every visitor downloads.
 */
async function readManifest() {
  if (!fs.existsSync(SERVER_DIR)) {
    fail("No build found at .output/server. Run 'pnpm build' first.")
  }
  const manifestFile = fs
    .readdirSync(SERVER_DIR)
    .find((name) => name.includes('tanstack-start-manifest'))
  if (!manifestFile) {
    fail(
      'No TanStack Start manifest found in .output/server; cannot determine the initial load.',
    )
  }

  const module = await import(
    pathToFileURL(path.join(SERVER_DIR, manifestFile)).href
  )
  const manifest = module.tsrStartManifest()
  if (!manifest?.routes) {
    fail('Unexpected manifest shape: no `routes` map found.')
  }
  return manifest
}

function collectRouteAssets(manifest) {
  const routes = new Map()

  const visit = (node, routePath) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const entry of node) visit(entry, routePath)
      return
    }
    if (Array.isArray(node.preloads)) {
      const hrefs = [
        ...node.preloads,
        ...(node.assets ?? []).map((asset) => asset?.attrs?.href),
      ].filter(Boolean)
      routes.set(routePath || '__root__', [
        ...new Set(hrefs.map((href) => href.replace(/^\//, ''))),
      ])
    }
    for (const key of Object.keys(node)) {
      if (key === 'preloads' || key === 'assets') continue
      visit(node[key], routePath ? `${routePath}/${key}` : key)
    }
  }

  visit(manifest.routes, '')
  return routes
}

function measureAssets() {
  if (!fs.existsSync(ASSETS_DIR)) {
    fail(
      `No assets found at ${path.relative(ROOT, ASSETS_DIR)}. Run 'pnpm build' first.`,
    )
  }

  return fs
    .readdirSync(ASSETS_DIR)
    .filter((name) => COMPRESSIBLE.test(name))
    .map((name) => {
      const filePath = path.join(ASSETS_DIR, name)
      const buffer = fs.readFileSync(filePath)
      const gzip = gzipBytes(buffer)
      return {
        name,
        rawBytes: buffer.length,
        gzipBytes: gzip,
        gzipKb: round(kb(gzip)),
      }
    })
    .sort((a, b) => b.gzipBytes - a.gzipBytes)
}

function routeTotals(hrefs, assets) {
  const byName = new Map(assets.map((asset) => [asset.name, asset]))
  const missing = []
  let gzipBytes = 0

  for (const file of hrefs) {
    const asset = byName.get(path.basename(file))
    if (!asset) {
      missing.push(file)
      continue
    }
    gzipBytes += asset.gzipBytes
  }

  return {
    gzipBytes,
    gzipKb: round(kb(gzipBytes)),
    count: hrefs.length,
    missing,
  }
}

function evaluate(config, assets, routes) {
  const checks = []
  const { budgets } = config

  checks.push({
    label: 'Total emitted JS + CSS',
    actualKb: round(kb(assets.reduce((sum, a) => sum + a.gzipBytes, 0))),
    maxKb: budgets.totalJavaScriptKb,
  })

  checks.push({
    label: 'Largest single chunk',
    actualKb: assets.length ? assets[0].gzipKb : 0,
    maxKb: budgets.largestChunkKb,
    detail: assets.length ? assets[0].name : 'none',
  })

  for (const routeBudget of config.routeBudgets) {
    const hrefs = routes.get(routeBudget.route)
    if (!hrefs) {
      checks.push({
        label: `Route: ${routeBudget.label}`,
        actualKb: 0,
        maxKb: routeBudget.maxKb,
        missingPattern: routeBudget.route,
        ok: false,
      })
      continue
    }
    const totals = routeTotals(hrefs, assets)
    checks.push({
      label: `Route: ${routeBudget.label}`,
      actualKb: totals.gzipKb,
      maxKb: routeBudget.maxKb,
      detail: `${totals.count} assets`,
    })
  }

  for (const chunkBudget of config.chunkBudgets) {
    const matcher = globToRegExp(chunkBudget.match)
    const matches = assets.filter((asset) => matcher.test(asset.name))
    if (matches.length === 0) {
      checks.push({
        label: chunkBudget.label,
        actualKb: 0,
        maxKb: chunkBudget.maxKb,
        missingPattern: chunkBudget.match,
        ok: false,
      })
      continue
    }
    const largest = matches.reduce((a, b) =>
      b.gzipBytes > a.gzipBytes ? b : a,
    )
    checks.push({
      label: chunkBudget.label,
      actualKb: largest.gzipKb,
      maxKb: chunkBudget.maxKb,
      detail: largest.name,
    })
  }

  return checks.map((check) => ({
    ...check,
    overByKb:
      check.actualKb > check.maxKb ? round(check.actualKb - check.maxKb) : 0,
    ok: check.ok ?? check.actualKb <= check.maxKb,
  }))
}

function printReport(checks, rootTotals, assets, routes) {
  const nameWidth = Math.max(...checks.map((c) => c.label.length), 20)
  const failures = checks.filter((check) => !check.ok)

  console.log('\nClient bundle performance budget\n')
  console.log(
    `  ${'Budget'.padEnd(nameWidth)}  ${'Actual'.padStart(10)}  ${'Limit'.padStart(10)}  Result`,
  )
  console.log(
    `  ${'-'.repeat(nameWidth)}  ${'-'.repeat(10)}  ${'-'.repeat(10)}  ------`,
  )

  for (const check of checks) {
    const actual = `${check.actualKb.toFixed(1)} KB`
    const limit = `${check.maxKb.toFixed(1)} KB`
    let result = 'PASS'
    if (!check.ok) result = `FAIL (+${check.overByKb.toFixed(1)} KB)`
    else if (check.maxKb > 0 && check.actualKb > check.maxKb * 0.9)
      result = 'PASS (near limit)'
    if (check.missingPattern)
      result = `FAIL (nothing matches ${check.missingPattern})`
    console.log(
      `  ${check.label.padEnd(nameWidth)}  ${actual.padStart(10)}  ${limit.padStart(10)}  ${result}`,
    )
  }

  console.log(
    `\n  Initial load spans ${rootTotals.count} assets; ${assets.length} JS/CSS assets emitted across ${routes.size} routes.`,
  )
  console.log('\n  Largest assets (gzipped):')
  for (const asset of assets.slice(0, 5)) {
    console.log(`    ${String(asset.gzipKb).padStart(8)} KB  ${asset.name}`)
  }

  if (rootTotals.missing.length > 0) {
    console.log(
      `\n  Warning: ${rootTotals.missing.length} preloaded asset(s) were not found in .output/public/assets.`,
    )
  }

  if (failures.length > 0) {
    console.log(
      `\n  ${failures.length} budget failure(s). Either remove the regression or, if the growth`,
    )
    console.log(
      '  is intentional, raise the limit in perf/bundle-budget.config.json and say why in the PR.\n',
    )
    return 1
  }

  console.log('\n  All bundle budgets satisfied.\n')
  return 0
}

const jsonMode = process.argv.includes('--json')
const config = readConfig()
const assets = measureAssets()
const manifest = await readManifest()
const routes = collectRouteAssets(manifest)
const rootHrefs = routes.get('__root__') ?? []
const rootTotals = routeTotals(rootHrefs, assets)
const checks = evaluate(config, assets, routes)

if (jsonMode) {
  console.log(
    JSON.stringify(
      {
        checks,
        initial: { ...rootTotals, assets: rootHrefs },
        routes: Object.fromEntries(
          [...routes].map(([route, hrefs]) => [
            route,
            routeTotals(hrefs, assets),
          ]),
        ),
        assets,
      },
      null,
      2,
    ),
  )
} else {
  process.exit(printReport(checks, rootTotals, assets, routes))
}
