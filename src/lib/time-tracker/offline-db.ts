/**
 * Encrypted IndexedDB storage for offline mode (offline-mode REQ-1).
 *
 * Every record belongs to an `owner` (`workspaceId:memberId`). Payloads are
 * AES-256-GCM encrypted with a per-owner, non-extractable WebCrypto key kept in
 * the `keys` store; only routing fields (`id`, `owner`, `seq`) stay plaintext.
 * This protects against storage inspection and shared-device snooping, not
 * against script running in the origin (see the spec's threat model).
 *
 * No dependency: a thin promise wrapper over the native IndexedDB API.
 */

export const OFFLINE_DB_NAME = 'trackly-offline'
const OFFLINE_DB_VERSION = 1

/** Stores holding encrypted, owner-scoped records. */
export type RecordStore =
  | 'queue'
  | 'needsReview'
  | 'pendingDisplay'
  | 'meta'
  | 'cache'

const RECORD_STORES: RecordStore[] = [
  'queue',
  'needsReview',
  'pendingDisplay',
  'meta',
  'cache',
]

type StoredRecord = {
  key: string
  owner: string
  id: string
  seq: number
  iv: Uint8Array<ArrayBuffer>
  data: ArrayBuffer
}

export type DecodedRecord<T> = { id: string; seq: number; value: T }

export class OfflineStorageUnavailableError extends Error {
  constructor(message = 'Offline storage is not available in this browser.') {
    super(message)
    this.name = 'OfflineStorageUnavailableError'
  }
}

export function isOfflineStorageAvailable(): boolean {
  return (
    typeof indexedDB !== 'undefined' &&
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined'
  )
}

let dbPromise: Promise<IDBDatabase> | null = null

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'))
    tx.onerror = () => reject(tx.error)
  })
}

export function openOfflineDb(): Promise<IDBDatabase> {
  if (!isOfflineStorageAvailable()) {
    return Promise.reject(new OfflineStorageUnavailableError())
  }
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      for (const name of RECORD_STORES) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, { keyPath: 'key' })
          store.createIndex('owner', 'owner')
        }
      }
      if (!db.objectStoreNames.contains('keys')) {
        db.createObjectStore('keys')
      }
    }
    request.onsuccess = () => {
      const db = request.result
      // Another tab deleting the database (logout) must not be blocked.
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () =>
      reject(new OfflineStorageUnavailableError('Offline storage is busy.'))
  }).catch((err: unknown) => {
    dbPromise = null
    throw err
  })
  return dbPromise
}

// ── Keys and encryption ───────────────────────────────────────────────────────

const keyCache = new Map<string, Promise<CryptoKey>>()

/** The owner's non-extractable AES-GCM key, created on first use. */
export function getOwnerKey(owner: string): Promise<CryptoKey> {
  const cached = keyCache.get(owner)
  if (cached) return cached
  const promise = (async () => {
    const db = await openOfflineDb()
    const existing = await requestToPromise<CryptoKey | undefined>(
      db.transaction('keys').objectStore('keys').get(owner),
    )
    if (existing) return existing
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    )
    const tx = db.transaction('keys', 'readwrite')
    // `add` fails if another tab created the key first; then use theirs.
    tx.objectStore('keys').add(key, owner)
    try {
      await transactionDone(tx)
      return key
    } catch {
      const winner = await requestToPromise<CryptoKey | undefined>(
        db.transaction('keys').objectStore('keys').get(owner),
      )
      if (!winner) throw new Error('Could not create the offline key.')
      return winner
    }
  })()
  keyCache.set(owner, promise)
  promise.catch(() => keyCache.delete(owner))
  return promise
}

async function encrypt(owner: string, value: unknown) {
  const key = await getOwnerKey(owner)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  )
  return { iv, data }
}

async function decrypt(owner: string, record: StoredRecord): Promise<unknown> {
  const key = await getOwnerKey(owner)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: record.iv },
    key,
    record.data,
  )
  return JSON.parse(new TextDecoder().decode(plain))
}

const recordKey = (owner: string, id: string) => `${owner}|${id}`

// ── Record operations ─────────────────────────────────────────────────────────

export type RecordWrite = {
  store: RecordStore
  id: string
  seq?: number
  /** `undefined` deletes the record. */
  value: unknown
}

/**
 * Applies several writes in one transaction: all commit or none do. Values are
 * encrypted before the transaction opens (IndexedDB transactions cannot span
 * the async WebCrypto calls).
 */
export async function writeRecords(
  owner: string,
  writes: RecordWrite[],
): Promise<void> {
  if (writes.length === 0) return
  const prepared = await Promise.all(
    writes.map(async (write) => {
      if (write.value === undefined) return { write, record: null }
      const { iv, data } = await encrypt(owner, write.value)
      const record: StoredRecord = {
        key: recordKey(owner, write.id),
        owner,
        id: write.id,
        seq: write.seq ?? 0,
        iv,
        data,
      }
      return { write, record }
    }),
  )
  const db = await openOfflineDb()
  const stores = [...new Set(writes.map((w) => w.store))]
  const tx = db.transaction(stores, 'readwrite')
  for (const { write, record } of prepared) {
    const store = tx.objectStore(write.store)
    if (record) store.put(record)
    else store.delete(recordKey(owner, write.id))
  }
  await transactionDone(tx)
}

/**
 * Reads every record of an owner, ordered by `seq`. Records that fail to
 * decrypt or parse are returned in `corrupt` instead of being dropped.
 */
export async function readRecords<T>(
  owner: string,
  store: RecordStore,
): Promise<{ records: DecodedRecord<T>[]; corrupt: string[] }> {
  const db = await openOfflineDb()
  const raw = await requestToPromise<StoredRecord[]>(
    db.transaction(store).objectStore(store).index('owner').getAll(owner),
  )
  const records: DecodedRecord<T>[] = []
  const corrupt: string[] = []
  for (const record of raw) {
    try {
      const value = (await decrypt(owner, record)) as T
      records.push({ id: record.id, seq: record.seq, value })
    } catch {
      corrupt.push(record.id)
    }
  }
  records.sort((a, b) => a.seq - b.seq)
  return { records, corrupt }
}

/** Raw stored bytes, for tests that assert nothing is kept in plaintext. */
export async function readRawRecords(store: RecordStore) {
  const db = await openOfflineDb()
  return requestToPromise<StoredRecord[]>(
    db.transaction(store).objectStore(store).getAll(),
  )
}

/** Owners that have any record in a store (used to find other members' data). */
export async function listOwners(store: RecordStore): Promise<string[]> {
  const db = await openOfflineDb()
  const keys = await requestToPromise<IDBValidKey[]>(
    db.transaction(store).objectStore(store).index('owner').getAllKeys(),
  )
  return [
    ...new Set(keys.map((key) => String(key).split('|')[0]).filter(Boolean)),
  ]
}

/** Deletes every record and the key of one owner. */
export async function deleteOwnerData(owner: string): Promise<void> {
  const db = await openOfflineDb()
  const tx = db.transaction([...RECORD_STORES, 'keys'], 'readwrite')
  for (const name of RECORD_STORES) {
    const store = tx.objectStore(name)
    const request = store.index('owner').getAllKeys(owner)
    request.onsuccess = () => {
      for (const key of request.result) store.delete(key)
    }
  }
  tx.objectStore('keys').delete(owner)
  await transactionDone(tx)
  keyCache.delete(owner)
}

/** Deletes the whole offline database (logout / wipe). */
export async function deleteOfflineDatabase(): Promise<void> {
  keyCache.clear()
  if (dbPromise) {
    try {
      ;(await dbPromise).close()
    } catch {
      // already failed to open; nothing to close
    }
    dbPromise = null
  }
  if (typeof indexedDB === 'undefined') return
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(OFFLINE_DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    // Other tabs are closed by their `onversionchange` handler.
    request.onblocked = () => resolve()
  })
}

/** Asks the browser not to evict offline data under storage pressure. */
export async function requestPersistence(): Promise<boolean | null> {
  try {
    // Not every browser (or test environment) implements the Storage API.
    const storage = (navigator as { storage?: Partial<StorageManager> }).storage
    if (!storage?.persist) return null
    if (storage.persisted && (await storage.persisted())) return true
    return await storage.persist()
  } catch {
    return null
  }
}

/** Test helper: forget cached connections and keys. */
export function resetOfflineDbForTests() {
  keyCache.clear()
  dbPromise = null
}
