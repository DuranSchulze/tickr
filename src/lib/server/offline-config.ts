import { createServerFn } from '@tanstack/react-start'

/** Offline-mode rollout switches; see `readOfflineConfig`. */
export type OfflineConfig = {
  queueV2: boolean
  cache: boolean
  graceHours: number
}

export const getOfflineConfigFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<OfflineConfig> => {
    const { readOfflineConfig } = await import('./offline-config.server')
    return readOfflineConfig()
  },
)
