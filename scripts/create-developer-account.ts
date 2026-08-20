import { Client } from 'pg'
import crypto from 'node:crypto'
import { createId } from '@paralleldrive/cuid2'

/**
 * Bootstrap script: create a developer access account for a workspace.
 *
 * Usage:
 *   dotenv -e .env.local -- tsx scripts/create-developer-account.ts \
 *     --workspace acme-inc \
 *     --name "Payroll Integration" \
 *     --email dev@example.com \
 *     --password "change-me-please" \
 *     [--permission ADMIN]   # default OWNER
 *
 * The workspace argument accepts a slug or id. The account can then sign in
 * at POST /api/v1/auth/developer-sign-in and receives a high-level JWT.
 */

function parseArgs() {
  const args = process.argv.slice(2)
  const values: Record<string, string> = {}
  for (let i = 0; i < args.length - 1; i += 2) {
    const key = args[i].replace(/^--/, '')
    const value = args[i + 1]
    if (key && value) values[key] = value
  }
  return values
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

async function main() {
  const args = parseArgs()
  const workspace = args.workspace
  const name = args.name
  const email = args.email.trim().toLowerCase()
  const password = args.password
  const permissionLevel = args.permission === 'ADMIN' ? 'ADMIN' : 'OWNER'

  if (!workspace || !name || !email || !password) {
    console.error(
      'Usage: --workspace <slug|id> --name <name> --email <email> --password <password> [--permission ADMIN]',
    )
    process.exit(1)
  }
  if (password.length < 10) {
    console.error('Password must be at least 10 characters.')
    process.exit(1)
  }

  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DIRECT_URL or DATABASE_URL is required.')
  }

  const client = new Client({ connectionString })
  await client.connect()
  try {
    const workspaceResult = await client.query(
      `SELECT id, name, slug FROM workspaces WHERE slug = $1 OR id = $1 LIMIT 1`,
      [workspace],
    )
    const ws = workspaceResult.rows[0]
    if (!ws) {
      console.error(`Workspace not found: ${workspace}`)
      process.exit(1)
    }

    const existing = await client.query(
      `SELECT id FROM developer_accounts WHERE workspace_id = $1 AND email = $2 LIMIT 1`,
      [ws.id, email],
    )
    if (existing.rows[0]) {
      console.error(
        `A developer account for ${email} already exists in this workspace.`,
      )
      process.exit(1)
    }

    const result = await client.query(
      `INSERT INTO developer_accounts (id, workspace_id, name, email, password_hash, permission_level, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, now(), now())
       RETURNING id`,
      [createId(), ws.id, name, email, hashPassword(password), permissionLevel],
    )

    console.log(
      `Created developer account ${email} (${permissionLevel}) for workspace "${ws.name}" (${ws.slug}).`,
    )
    console.log(
      `Sign in at POST /api/v1/auth/developer-sign-in with {"email": "${email}", "password": "***"} to receive a JWT.`,
    )
    console.log(`Account id: ${result.rows[0].id}`)
  } finally {
    await client.end()
  }
}

void main()
