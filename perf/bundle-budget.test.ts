import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Static bundle-regression guard.
 *
 * `perf/bundle-budget.mjs` measures the real build, but it needs a full `vite build`
 * and therefore cannot run on every save or in the fast unit-test job. This test
 * covers the same failure mode cheaply: it walks `src/` and asserts that the few
 * genuinely heavy dependencies are only statically imported from files that are
 * explicitly allowed to do so.
 *
 * A static import is what drags a library into whatever chunk first references it.
 * A dynamic `await import(...)` keeps it in its own lazy chunk and is always allowed.
 */

const ROOT = process.cwd()
const SRC_DIR = path.join(ROOT, 'src')
const CONFIG_PATH = path.join(ROOT, 'perf', 'bundle-budget.config.json')

type HeavyModule = {
  module: string
  reason: string
  allowedStaticImporters: string[]
}

type BudgetConfig = {
  budgets: Record<string, number>
  routeBudgets: Array<{ route: string; label: string; maxKb: number }>
  chunkBudgets: Array<{ label: string; match: string; maxKb: number }>
  heavyModules: HeavyModule[]
}

function readConfig(): BudgetConfig {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
  return JSON.parse(raw) as BudgetConfig
}

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__snapshots__')
        continue
      found.push(...sourceFiles(full))
      continue
    }
    if (!/\.(ts|tsx|mts|cts)$/.test(entry.name)) continue
    if (/\.(test|spec)\.(ts|tsx|mts|cts)$/.test(entry.name)) continue
    found.push(full)
  }
  return found
}

/** Strip comments so a mention of a module inside a comment is never treated as an import. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * Collect the module specifiers imported with a *static* import statement.
 * Dynamic `import('x')` and CommonJS `require('x')` are deliberately not collected.
 */
function staticImportSpecifiers(source: string): string[] {
  const clean = stripComments(source)
  const specifiers: string[] = []
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[\s\S]*?)\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g,
  ]
  for (const pattern of patterns) {
    for (const match of clean.matchAll(pattern)) {
      if (match[1]) specifiers.push(match[1])
    }
  }
  return specifiers
}

/** Resolve a specifier to the file it points at, or null for bare packages. */
function resolveSpecifier(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null
  const base = path.resolve(path.dirname(fromFile), specifier)
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ]
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate
    } catch {
      // keep trying
    }
  }
  return null
}

/** Does this file's resolved import specifier point at `moduleName`'s package entry? */
function importsModule(
  fromFile: string,
  specifier: string,
  moduleName: string,
): boolean {
  if (specifier === moduleName || specifier.startsWith(`${moduleName}/`)) {
    return specifier.startsWith(`${moduleName}/`) ? false : true
  }
  const resolved = resolveSpecifier(fromFile, specifier)
  if (!resolved) return false
  try {
    const pkg = JSON.parse(
      fs.readFileSync(
        path.join(ROOT, 'node_modules', moduleName, 'package.json'),
        'utf8',
      ),
    ) as { main?: string; module?: string; exports?: unknown }
    const entry = path.join(
      ROOT,
      'node_modules',
      moduleName,
      pkg.module ?? pkg.main ?? 'index.js',
    )
    return path.resolve(entry) === path.resolve(resolved)
  } catch {
    return false
  }
}

function findStaticImporters(moduleName: string): string[] {
  const importers: string[] = []
  for (const file of sourceFiles(SRC_DIR)) {
    const source = fs.readFileSync(file, 'utf8')
    const hit = staticImportSpecifiers(source).some((specifier) =>
      importsModule(file, specifier, moduleName),
    )
    if (hit) importers.push(path.relative(ROOT, file).split(path.sep).join('/'))
  }
  return importers.sort()
}

const config = readConfig()

describe('performance budget configuration', () => {
  it('exists and parses as valid JSON', () => {
    expect(fs.existsSync(CONFIG_PATH)).toBe(true)
    expect(config).toBeTypeOf('object')
  })

  it('defines every budget the gate enforces', () => {
    expect(config.budgets.totalJavaScriptKb).toBeGreaterThan(0)
    expect(config.budgets.largestChunkKb).toBeGreaterThan(0)
    expect(config.routeBudgets.length).toBeGreaterThan(0)
    expect(config.chunkBudgets.length).toBeGreaterThan(0)
    expect(config.heavyModules.length).toBeGreaterThan(0)
  })

  it('gives every budget a positive limit and a non-empty label', () => {
    for (const budget of config.routeBudgets) {
      expect(budget.maxKb, `route budget ${budget.route}`).toBeGreaterThan(0)
      expect(
        budget.label.length,
        `route budget ${budget.route}`,
      ).toBeGreaterThan(0)
    }
    for (const budget of config.chunkBudgets) {
      expect(budget.maxKb, `chunk budget ${budget.label}`).toBeGreaterThan(0)
      expect(
        budget.match.length,
        `chunk budget ${budget.label}`,
      ).toBeGreaterThan(0)
    }
  })

  it('keeps every route budget within the total bundle budget', () => {
    // A route budget larger than the whole bundle would be meaningless: it could
    // never fail, so it would silently stop protecting anything.
    for (const budget of config.routeBudgets) {
      expect(
        budget.maxKb,
        `route budget for ${budget.route} exceeds the total budget`,
      ).toBeLessThanOrEqual(config.budgets.totalJavaScriptKb)
    }
    for (const budget of config.chunkBudgets) {
      expect(
        budget.maxKb,
        `chunk budget "${budget.label}" exceeds the total budget`,
      ).toBeLessThanOrEqual(config.budgets.totalJavaScriptKb)
    }
  })

  it('covers the initial load with a route budget', () => {
    // The root payload is paid by every page view, so the gate must always measure it.
    expect(
      config.routeBudgets.some((budget) => budget.route === '__root__'),
    ).toBe(true)
  })
})

describe('heavy dependency imports', () => {
  for (const heavy of config.heavyModules) {
    describe(heavy.module, () => {
      const importers = findStaticImporters(heavy.module)

      it('is statically imported only from allow-listed files', () => {
        const allowed = new Set(heavy.allowedStaticImporters)
        const unexpected = importers.filter((file) => !allowed.has(file))
        expect(
          unexpected,
          [
            `${heavy.module} (${heavy.reason}) is statically imported from:`,
            ...unexpected.map((file) => `  - ${file}`),
            '',
            "A static import pulls it into that file's chunk. Use a dynamic",
            '`await import(...)` at the call site instead, or add the file to',
            `heavyModules[].allowedStaticImporters in perf/bundle-budget.config.json`,
            'with a justification in the PR.',
          ].join('\n'),
        ).toEqual([])
      })

      it('does not list stale allow-list entries', () => {
        const actual = new Set(importers)
        const stale = heavy.allowedStaticImporters.filter(
          (file) => !actual.has(file),
        )
        expect(
          stale,
          `These allow-list entries no longer statically import ${heavy.module}; remove them so the list stays honest.`,
        ).toEqual([])
      })

      it('has a non-empty reason explaining why it is heavy', () => {
        expect(heavy.reason.length).toBeGreaterThan(10)
      })
    })
  }
})
