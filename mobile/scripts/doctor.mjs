import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

export function findJavaHome(env = process.env) {
  const candidates = [
    env.JAVA_HOME,
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
  ]
  return candidates.find((path) => path && existsSync(join(path, 'bin/java')))
}

export function findSdk(env = process.env) {
  const candidates = [
    env.ANDROID_HOME,
    env.ANDROID_SDK_ROOT,
    join(homedir(), 'Library/Android/sdk'),
    join(homedir(), 'Android/Sdk'),
  ]
  return candidates.find(
    (path) => path && existsSync(join(path, 'platform-tools/adb')),
  )
}

export function checkEnvironment() {
  const java = findJavaHome()
  const sdk = findSdk()
  const issues = []
  if (Number(process.versions.node.split('.')[0]) < 22)
    issues.push('Node 22 or newer is required.')
  if (!java) issues.push('Install Android Studio / JDK 21, or set JAVA_HOME.')
  if (!sdk)
    issues.push(
      'Install Android SDK using Android Studio, accept its license, and set ANDROID_HOME.',
    )
  if (sdk && !existsSync(join(sdk, 'platforms/android-36/android.jar')))
    issues.push('Install Android SDK Platform 36 using SDK Manager.')
  const result = {
    node: process.versions.node,
    javaHome: java ?? null,
    androidHome: sdk ?? null,
    issues,
  }
  if (java) {
    const version = spawnSync(join(java, 'bin/java'), ['-version'], {
      encoding: 'utf8',
    })
    result.javaVersion = (version.stderr || version.stdout).split('\n')[0]
  }
  if (sdk) {
    const devices = spawnSync(join(sdk, 'platform-tools/adb'), ['devices'], {
      encoding: 'utf8',
    })
    result.devices = devices.stdout?.trim()
    if (existsSync(join(sdk, 'licenses/android-sdk-license')))
      result.licensePresent =
        readFileSync(join(sdk, 'licenses/android-sdk-license'), 'utf8').trim()
          .length > 0
  }
  return result
}

if (process.argv[1]?.endsWith('/doctor.mjs')) {
  const result = checkEnvironment()
  console.log(JSON.stringify(result, null, 2))
  if (result.issues.length) process.exitCode = 1
}
