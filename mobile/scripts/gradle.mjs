import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { findJavaHome, findSdk } from './doctor.mjs'
import { resolveServerUrl } from '../capacitor.config.ts'

const task = process.argv[2]
if (
  ![
    'assembleDebug',
    'assembleRelease',
    'bundleRelease',
    'connectedDebugAndroidTest',
    'assembleDebugAndroidTest',
  ].includes(task)
)
  throw new Error('Unsupported Android build task.')
const server = resolveServerUrl(process.env)
const releaseTask = task === 'assembleRelease' || task === 'bundleRelease'
if (
  releaseTask &&
  (server.cleartext || process.env.MOBILE_ALLOW_LOCAL_HTTP === '1')
) {
  throw new Error('Release builds cannot enable local HTTP.')
}
const java = findJavaHome()
const sdk = findSdk()
if (!java || !sdk)
  throw new Error(
    'Android toolchain missing. Run pnpm --dir mobile doctor for setup instructions.',
  )
const result = spawnSync('./gradlew', [`:app:${task}`, '--no-daemon'], {
  cwd: fileURLToPath(new URL('../android/', import.meta.url)),
  env: { ...process.env, JAVA_HOME: java, ANDROID_HOME: sdk },
  stdio: 'inherit',
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
