/**
 * Dev-only: stamps sample IP/location/coordinate data onto recent time
 * entries so the map views have realistic pins during local development.
 *
 * Only touches entries that have no origin data yet (ip_address IS NULL)
 * and only the most recent --limit entries per run. Run with --apply to
 * write; without it, prints a preview only.
 *
 *   pnpm dotenv -e .env.local -- tsx scripts/sample-entry-origins.ts [--apply]
 */
import { Client } from 'pg'

const applyChanges = process.argv.includes('--apply')
const limit = Number(process.env.LIMIT ?? 40)
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DIRECT_URL or DATABASE_URL is required.')
}

// City-level origins approximating what ipinfo.io would resolve.
const SAMPLE_ORIGINS = [
  { ip: '112.198.14.5', location: 'Quezon City, Metro Manila, Philippines', lat: 14.676, lng: 121.043 },
  { ip: '112.198.82.101', location: 'Cebu City, Central Visayas, Philippines', lat: 10.3167, lng: 123.8907 },
  { ip: '49.144.51.7', location: 'Davao City, Davao Region, Philippines', lat: 7.1907, lng: 125.4553 },
  { ip: '128.199.85.10', location: 'Singapore, Central Singapore, Singapore', lat: 1.3521, lng: 103.8198 },
]

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
]

const client = new Client({ connectionString })

async function main() {
  await client.connect()

  const targets = await client.query<{ id: string }>(
    `SELECT id FROM time_entries WHERE ip_address IS NULL ORDER BY started_at DESC LIMIT $1`,
    [limit],
  )

  console.log(`Entries without origin data (most recent ${limit}): ${targets.rows.length}`)

  if (!applyChanges) {
    console.log('Preview only — re-run with --apply to write.')
    await client.end()
    return
  }

  let i = 0
  for (const row of targets.rows) {
    const origin = SAMPLE_ORIGINS[i % SAMPLE_ORIGINS.length]
    const ua = USER_AGENTS[i % USER_AGENTS.length]
    await client.query(
      `UPDATE time_entries
         SET ip_address = $2,
             location = $3,
             latitude = $4,
             longitude = $5,
             user_agent = $6
       WHERE id = $1`,
      [row.id, origin.ip, origin.location, origin.lat, origin.lng, ua],
    )
    i++
  }

  console.log(`Stamped ${i} entries with sample origins.`)
  await client.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
