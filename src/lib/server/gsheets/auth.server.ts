type ServiceAccountJson = {
  client_email: string
  private_key: string
}

type SheetsResponse<T> = {
  data: T
}

type SheetMetadata = {
  sheets?: Array<{
    properties?: {
      title?: string
      sheetId?: number
    }
  }>
}

type BatchUpdateResponse = {
  replies?: Array<{
    addSheet?: {
      properties?: {
        title?: string
        sheetId?: number
      }
    }
  }>
}

type ValuesResponse = {
  values?: string[][]
}

type BatchUpdateRequest = {
  requests: unknown[]
}

type ValuesRequest = {
  values: unknown[][]
}

type BatchValuesRequest = {
  valueInputOption: string
  data: Array<{ range: string; values: unknown[][] }>
}

type SheetsClient = {
  spreadsheets: {
    get: (input: {
      spreadsheetId: string
    }) => Promise<SheetsResponse<SheetMetadata>>
    batchUpdate: (input: {
      spreadsheetId: string
      requestBody: BatchUpdateRequest
    }) => Promise<SheetsResponse<BatchUpdateResponse>>
    values: {
      get: (input: {
        spreadsheetId: string
        range: string
      }) => Promise<SheetsResponse<ValuesResponse>>
      clear: (input: {
        spreadsheetId: string
        range: string
      }) => Promise<SheetsResponse<Record<string, unknown>>>
      update: (input: {
        spreadsheetId: string
        range: string
        valueInputOption: string
        requestBody: ValuesRequest
      }) => Promise<SheetsResponse<Record<string, unknown>>>
      append: (input: {
        spreadsheetId: string
        range: string
        valueInputOption: string
        insertDataOption: string
        requestBody: ValuesRequest
      }) => Promise<SheetsResponse<Record<string, unknown>>>
      batchUpdate: (input: {
        spreadsheetId: string
        requestBody: BatchValuesRequest
      }) => Promise<SheetsResponse<Record<string, unknown>>>
    }
  }
}

type TokenCache = {
  accessToken: string
  expiresAt: number
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'
const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3/files'
// Drive scope required to manage sheet permissions (share with users)
const GOOGLE_COMBINED_SCOPE =
  'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive'

let cachedCreds: ServiceAccountJson | null = null
let cachedToken: TokenCache | null = null
let cachedClient: SheetsClient | null = null

function stripQuotes(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function normalizePrivateKey(raw: string): string {
  // `.env` files escape newlines as literal `\n`; most dotenv loaders already
  // unescape them, but some deployment hosts (Vercel, Netlify) paste the key
  // with `\n` kept literal. Handle both defensively.
  return stripQuotes(raw).replace(/\\n/g, '\n')
}

function loadCredentials(): ServiceAccountJson {
  if (cachedCreds) return cachedCreds

  // Preferred: split env vars (easier to paste from the service-account JSON)
  const splitEmail = process.env.GOOGLE_CLIENT_EMAIL
  const splitKey = process.env.GOOGLE_PRIVATE_KEY
  if (splitEmail && splitKey) {
    cachedCreds = {
      client_email: stripQuotes(splitEmail),
      private_key: normalizePrivateKey(splitKey),
    }
    return cachedCreds
  }

  // Fallback: full JSON blob pasted into a single env var.
  const raw = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON
  if (!raw) {
    throw new Error(
      'Google service-account credentials are not set. ' +
        'Set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY in .env.local, ' +
        'or paste the full JSON into GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON.',
    )
  }

  let parsed: ServiceAccountJson
  try {
    parsed = JSON.parse(raw) as ServiceAccountJson
  } catch {
    throw new Error('GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON is not valid JSON.')
  }

  if (!parsed.client_email || !parsed.private_key) {
    throw new Error(
      'Service-account JSON is missing client_email or private_key.',
    )
  }

  parsed.private_key = normalizePrivateKey(parsed.private_key)

  cachedCreds = parsed
  return parsed
}

export function getServiceAccountEmail(): string {
  return loadCredentials().client_email
}

export async function shareSheetWithUser(
  sheetId: string,
  email: string,
): Promise<void> {
  const token = await getAccessToken()
  const url = `${GOOGLE_DRIVE_API}/${sheetId}/permissions?sendNotificationEmail=true`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'user', role: 'writer', emailAddress: email }),
  })
  if (!response.ok) {
    const data = await parseJsonResponse(response)
    throw new Error(getGoogleErrorMessage(response.status, data))
  }
}

export function getSheetsClient(): SheetsClient {
  if (cachedClient) return cachedClient

  cachedClient = {
    spreadsheets: {
      get: ({ spreadsheetId }) =>
        sheetsRequest<SheetMetadata>(`/${spreadsheetId}`, { method: 'GET' }),
      batchUpdate: ({ spreadsheetId, requestBody }) =>
        sheetsRequest<BatchUpdateResponse>(`/${spreadsheetId}:batchUpdate`, {
          method: 'POST',
          body: requestBody,
        }),
      values: {
        get: ({ spreadsheetId, range }) =>
          sheetsRequest<ValuesResponse>(
            `/${spreadsheetId}/values/${encodeURIComponent(range)}`,
            { method: 'GET' },
          ),
        clear: ({ spreadsheetId, range }) =>
          sheetsRequest<Record<string, unknown>>(
            `/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`,
            { method: 'POST', body: {} },
          ),
        update: ({ spreadsheetId, range, valueInputOption, requestBody }) =>
          sheetsRequest<Record<string, unknown>>(
            `/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=${encodeURIComponent(valueInputOption)}`,
            { method: 'PUT', body: requestBody },
          ),
        append: ({
          spreadsheetId,
          range,
          valueInputOption,
          insertDataOption,
          requestBody,
        }) =>
          sheetsRequest<Record<string, unknown>>(
            `/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=${encodeURIComponent(valueInputOption)}&insertDataOption=${encodeURIComponent(insertDataOption)}`,
            { method: 'POST', body: requestBody },
          ),
        batchUpdate: ({ spreadsheetId, requestBody }) =>
          sheetsRequest<Record<string, unknown>>(
            `/${spreadsheetId}/values:batchUpdate`,
            { method: 'POST', body: requestBody },
          ),
      },
    },
  }
  return cachedClient
}

async function sheetsRequest<T>(
  path: string,
  init: { method: string; body?: unknown },
): Promise<SheetsResponse<T>> {
  const token = await getAccessToken()
  const response = await fetch(`${GOOGLE_SHEETS_API}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body === undefined
        ? {}
        : { 'Content-Type': 'application/json' }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })

  const data = await parseJsonResponse(response)
  if (!response.ok) {
    throw new Error(getGoogleErrorMessage(response.status, data))
  }

  return { data: data as T }
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedToken.expiresAt - 60 > now) {
    return cachedToken.accessToken
  }

  const creds = loadCredentials()
  const assertion = await createJwtAssertion(creds, now)
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  const data = await parseJsonResponse(response)
  if (!response.ok) {
    throw new Error(getGoogleErrorMessage(response.status, data))
  }

  if (!isTokenResponse(data)) {
    throw new Error('Google token response was missing an access token.')
  }

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in,
  }
  return cachedToken.accessToken
}

async function createJwtAssertion(
  creds: ServiceAccountJson,
  now: number,
): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: creds.client_email,
    scope: GOOGLE_COMBINED_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  }
  const unsigned = `${base64UrlJson(header)}.${base64UrlJson(payload)}`
  const key = await importPrivateKey(creds.private_key)
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  )
  return `${unsigned}.${base64UrlBytes(new Uint8Array(signature))}`
}

async function importPrivateKey(privateKeyPem: string): Promise<CryptoKey> {
  const keyData = base64ToBytes(
    privateKeyPem
      .replace('-----BEGIN PRIVATE KEY-----', '')
      .replace('-----END PRIVATE KEY-----', '')
      .replace(/\s/g, ''),
  )
  return crypto.subtle.importKey(
    'pkcs8',
    bytesToArrayBuffer(keyData),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

function base64UrlJson(value: unknown): string {
  return base64UrlBytes(new TextEncoder().encode(JSON.stringify(value)))
}

function base64UrlBytes(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function getGoogleErrorMessage(status: number, data: unknown): string {
  if (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof data.error === 'object' &&
    data.error !== null &&
    'message' in data.error &&
    typeof data.error.message === 'string'
  ) {
    return `Google API error ${status}: ${data.error.message}`
  }
  return `Google API error ${status}`
}

function isTokenResponse(
  value: unknown,
): value is { access_token: string; expires_in: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'access_token' in value &&
    typeof value.access_token === 'string' &&
    'expires_in' in value &&
    typeof value.expires_in === 'number'
  )
}
