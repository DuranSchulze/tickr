import type { OfflineConfig } from './offline-config'

/**
 * Offline-mode rollout switches (offline-mode REQ-10). Unset means on; set to
 * `false` to switch a path off without a code change. `OFFLINE_GRACE_HOURS`
 * bounds offline boot from the cached session (REQ-6, default 24).
 */
export function readOfflineConfig(
  env: Record<string, string | undefined> = process.env,
): OfflineConfig {
  const grace = Number(env.OFFLINE_GRACE_HOURS)
  return {
    queueV2: env.OFFLINE_QUEUE_V2_ENABLED !== 'false',
    cache: env.OFFLINE_CACHE_ENABLED !== 'false',
    graceHours: Number.isFinite(grace) && grace > 0 ? grace : 24,
  }
}
