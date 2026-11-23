import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { findSdk } from './doctor.mjs'

const mode = process.argv[2] ?? 'queue'
if (!['queue', '--signout'].includes(mode))
  throw new Error('Unsupported restart test mode.')
const signOut = mode === '--signout'
const sdk = findSdk()
if (!sdk) throw new Error('Android SDK is missing. Run the mobile doctor.')
const config = JSON.parse(
  readFileSync(
    new URL(
      '../android/app/src/main/assets/capacitor.config.json',
      import.meta.url,
    ),
    'utf8',
  ),
)
if (config.server?.url !== 'http://localhost:3000/app/time-tracker')
  throw new Error(
    'Restart tests require the local development app at http://localhost:3000.',
  )
const adb = join(sdk, 'platform-tools/adb')
function run(args, verifyTests = false) {
  const result = spawnSync(adb, args, { encoding: 'utf8', timeout: 120_000 })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  process.stdout.write(output)
  if (
    result.error ||
    result.status !== 0 ||
    (verifyTests && !/OK \(1 test\)/.test(output))
  )
    throw new Error(`Android test command failed: ${args[0]}`)
  return output
}
run(['reverse', 'tcp:3000', 'tcp:3000'])
run([
  'install',
  '-r',
  fileURLToPath(
    new URL(
      '../android/app/build/outputs/apk/debug/app-debug.apk',
      import.meta.url,
    ),
  ),
])
run([
  'install',
  '-r',
  fileURLToPath(
    new URL(
      '../android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk',
      import.meta.url,
    ),
  ),
])
const methods = signOut
  ? [
      ['prime', 'localSignOutPrimeForRestart'],
      ['restore', 'localSignOutRemainsLockedAfterProcessDeath'],
    ]
  : [
      ['prime', 'actualQueuePrimeForRestart'],
      ['restore', 'actualQueueRestoresAfterProcessDeath'],
    ]
let network
if (signOut) {
  network = {
    wifi: run(['shell', 'settings', 'get', 'global', 'wifi_on']).trim(),
    data: run(['shell', 'settings', 'get', 'global', 'mobile_data']).trim(),
  }
  if (
    ![network.wifi, network.data].every((value) => ['0', '1'].includes(value))
  ) {
    throw new Error(
      'Cannot safely restore emulator connectivity; no settings changed.',
    )
  }
}
try {
  if (signOut) {
    // ADB loopback remains available for source modules while Android reports
    // offline. No real account/session exists in the isolated QA profile.
    run(['shell', 'svc', 'wifi', 'disable'])
    run(['shell', 'svc', 'data', 'disable'])
  }
  for (const [stage, method] of methods) {
    if (signOut || stage === 'restore')
      run(['shell', 'am', 'force-stop', 'com.trackly.internal.debug'])
    run(
      [
        'shell',
        'am',
        'instrument',
        '-w',
        '-e',
        'class',
        `com.trackly.internal.StorageCapabilityTest#${method}`,
        '-e',
        'm1stage',
        stage,
        ...(signOut ? ['-e', 'storageProfile', 'local-signout'] : []),
        'com.trackly.internal.debug.test/androidx.test.runner.AndroidJUnitRunner',
      ],
      true,
    )
  }
  console.log(
    signOut
      ? 'Local sign-out marker and locked storage survived Android process death; synthetic server acknowledgement completed.'
      : 'Actual encrypted queue and legacy migration survived Android process death.',
  )
} finally {
  if (network) {
    run(['shell', 'svc', 'wifi', network.wifi === '1' ? 'enable' : 'disable'])
    run(['shell', 'svc', 'data', network.data === '1' ? 'enable' : 'disable'])
  }
  if (signOut) run(['shell', 'am', 'force-stop', 'com.trackly.internal.debug'])
}
