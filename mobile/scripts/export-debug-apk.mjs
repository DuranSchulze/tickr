import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const source = new URL(
  '../android/app/build/outputs/apk/debug/app-debug.apk',
  import.meta.url,
)
const output = new URL('../dist/', import.meta.url)
const apkName = 'Tickr-debug.apk'
const apk = new URL(apkName, output)

await mkdir(output, { recursive: true })
await copyFile(source, apk)
const checksum = createHash('sha256')
  .update(await readFile(apk))
  .digest('hex')
await writeFile(new URL('SHA256SUMS.txt', output), `${checksum}  ${apkName}\n`)

console.log(`Android debug APK: ${fileURLToPath(apk)}`)
console.log(`Checksum: ${fileURLToPath(new URL('SHA256SUMS.txt', output))}`)
