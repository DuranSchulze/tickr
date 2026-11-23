#!/usr/bin/env node
/**
 * Build the Markdown body for a GitHub Release.
 *
 * The release workflow passes everything through environment variables so the
 * same generated notes work for tag pushes, manual dispatches and local
 * previews:
 *
 *   RELEASE_VERSION=0.1.0 RELEASE_TAG=v0.1.0 RELEASE_SIGNED=false \
 *     node scripts/release-notes.mjs
 *
 * Optional: RELEASE_PREVIOUS_TAG, RELEASE_ASSETS (comma-separated names),
 * RELEASE_SERVER_URL, GITHUB_REPOSITORY, GITHUB_SERVER_URL.
 */

import { execFileSync } from 'node:child_process'

const version = (process.env.RELEASE_VERSION ?? '').trim() || '0.0.0'
const tag = (process.env.RELEASE_TAG ?? '').trim() || `v${version}`
const previousTag = (process.env.RELEASE_PREVIOUS_TAG ?? '').trim()
const signed = process.env.RELEASE_SIGNED === 'true'
const serverUrl =
  (process.env.RELEASE_SERVER_URL ?? '').trim() || 'https://trackly.ph'
const repository =
  (process.env.GITHUB_REPOSITORY ?? '').trim() || 'DuranSchulze/tickr'
const githubServer =
  (process.env.GITHUB_SERVER_URL ?? '').trim() || 'https://github.com'
const assets = (process.env.RELEASE_ASSETS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

const GROUPS = new Map([
  ['feat', 'Features'],
  ['fix', 'Bug fixes'],
  ['perf', 'Performance'],
  ['refactor', 'Refactoring'],
  ['revert', 'Reverts'],
  ['docs', 'Documentation'],
  ['test', 'Tests'],
  ['build', 'Build'],
  ['ci', 'CI'],
  ['chore', 'Chores'],
  ['style', 'Style'],
])

const CONVENTIONAL = /^([a-z]+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/i

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function collectCommits() {
  const args = previousTag
    ? ['log', `${previousTag}..HEAD`, '--no-merges', '--pretty=format:%s\t%h']
    : ['log', '-30', '--no-merges', '--pretty=format:%s\t%h']
  const output = git(args)
  return output ? output.split('\n') : []
}

function describeAsset(name) {
  if (name.endsWith('.apk')) {
    return name.includes('-debug')
      ? 'Debug-signed APK for internal evaluation'
      : 'Release-signed APK'
  }
  if (name.endsWith('.aab')) {
    return 'Signed Android App Bundle for managed distribution'
  }
  if (name === 'SHA256SUMS.txt') return 'SHA-256 checksums'
  return 'Release asset'
}

function renderChanges() {
  const groups = new Map()
  for (const line of collectCommits()) {
    const [subject = '', hash = ''] = line.split('\t')
    const match = subject.match(CONVENTIONAL)
    const type = match ? match[1].toLowerCase() : 'other'
    const label = GROUPS.get(type) ?? 'Other changes'
    const scope = match?.[2]
    const description = match ? match[4] : subject
    const entry = `- ${scope ? `**${scope}:** ` : ''}${description} (\`${hash}\`)`
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label).push(entry)
  }

  const order = [...GROUPS.values(), 'Other changes']
  const sections = []
  for (const label of order) {
    const entries = groups.get(label)
    if (!entries?.length) continue
    sections.push(`#### ${label}\n${entries.join('\n')}`)
  }
  return sections.length
    ? sections.join('\n\n')
    : '_No commits found since the previous release._'
}

const assetRows = assets
  .map((name) => `| \`${name}\` | ${describeAsset(name)} |`)
  .join('\n')

const apkName = assets.find((name) => name.endsWith('.apk'))

const androidIntro = signed
  ? [
      `The signed APK targets \`${serverUrl}\` and keeps the production application id \`com.trackly.internal\`.`,
    ].join('\n')
  : [
      '> **Internal test build.** This release is signed with the Android debug key and uses the `com.trackly.internal.debug` application id.',
      '> It is fine for internal evaluation, but it is not the production-signed package and cannot be published to a store.',
      '> Configure the release keystore secrets described in [`mobile/RELEASING.md`](' +
        `${githubServer}/${repository}/blob/HEAD/mobile/RELEASING.md) to publish a production-signed build.`,
    ].join('\n')

const installSteps = apkName
  ? [
      '**Install (Android 10+):**',
      '',
      `1. Download \`${apkName}\` from the assets above.`,
      '2. Allow installs from this source when Android prompts.',
      '3. Open Tickr and sign in once while online; offline capture is available after that.',
      `4. Optional: verify the download with \`sha256sum -c SHA256SUMS.txt\` (or \`shasum -a 256 ${apkName}\`).`,
    ].join('\n')
  : '_No APK was attached to this release._'

const compareLine = previousTag
  ? `**Full changelog:** [${previousTag}...${tag}](${githubServer}/${repository}/compare/${previousTag}...${tag})`
  : `**All commits:** [${tag}](${githubServer}/${repository}/commits/${tag})`

const body = `## Tickr ${tag}

### Web

The web app is deployed to DigitalOcean App Platform at <${serverUrl}> on every
\`main\` deploy. This release is product-wide: it does not change how the web app
is hosted, and it does not gate the web deployment.

### Android app

${androidIntro}

| Asset | Description |
| --- | --- |
${assetRows}

${installSteps}

### ${previousTag ? `Changes since ${previousTag}` : 'Recent commits'}

${renderChanges()}

---

${compareLine}
`

process.stdout.write(body)
