import type { OfflineConfig } from '#/lib/server/offline-config'

/**
 * Client copy of the offline rollout switches and the last known offline
 * owner. Both are non-sensitive (booleans and opaque ids) and live in
 * `localStorage` so they are available offline before any request succeeds.
 */

const CONFIG_KEY = 'trackly-offline-config'
const OWNER_KEY = 'trackly-offline-owner'

export const DEFAULT_OFFLINE_CONFIG: OfflineConfig = {
  queueV2: true,
  cache: true,
  graceHours: 24,
}

let cached: OfflineConfig | null = null

export function getOfflineConfig(): OfflineConfig {
  if (cached) return cached
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) {
      cached = { ...DEFAULT_OFFLINE_CONFIG, ...(JSON.parse(raw) as object) }
      return cached
    }
  } catch {
    // fall through to defaults
  }
  return DEFAULT_OFFLINE_CONFIG
}

export function setOfflineConfig(config: OfflineConfig) {
  cached = config
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  } catch {
    // in-memory copy still applies for this page
  }
}

/** `workspaceId:memberId` of the member who last used offline features. */
export function getLastOfflineOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY)
  } catch {
    return null
  }
}

export function setLastOfflineOwner(owner: string) {
  try {
    localStorage.setItem(OWNER_KEY, owner)
  } catch {
    // best effort
  }
}

export function clearOfflineSettings() {
  cached = null
  try {
    localStorage.removeItem(CONFIG_KEY)
    localStorage.removeItem(OWNER_KEY)
  } catch {
    // best effort
  }
}

/** Test helper. */
export function resetOfflineConfigForTests() {
  cached = null
}
