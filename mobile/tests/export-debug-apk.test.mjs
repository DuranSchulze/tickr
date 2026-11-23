import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

test('exports the built APK unchanged with a matching SHA-256 manifest', (context) => {
  const mobile = mkdtempSync(join(tmpdir(), 'trackly-apk-export-'))
  context.after(() => rmSync(mobile, { recursive: true, force: true }))
  const scripts = join(mobile, 'scripts')
  const source = join(mobile, 'android/app/build/outputs/apk/debug')
  mkdirSync(scripts)
  mkdirSync(source, { recursive: true })
  const script = join(scripts, 'export-debug-apk.mjs')
  copyFileSync(
    new URL('../scripts/export-debug-apk.mjs', import.meta.url),
    script,
  )
  const apk = Buffer.from('synthetic APK bytes for the export test')
  writeFileSync(join(source, 'app-debug.apk'), apk)

  const output = execFileSync(process.execPath, [script], { encoding: 'utf8' })
  const exported = join(mobile, 'dist/Tickr-debug.apk')
  assert.deepEqual(readFileSync(exported), apk)
  const checksum = createHash('sha256').update(apk).digest('hex')
  assert.equal(
    readFileSync(join(mobile, 'dist/SHA256SUMS.txt'), 'utf8'),
    `${checksum}  Tickr-debug.apk\n`,
  )
  assert.ok(output.includes(exported))
})
