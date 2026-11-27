import { describe, expect, it } from 'vitest'
import { readOfflineConfig } from '../offline-config.server'

/** offline-mode REQ-10, check C12 (server side). */
describe('readOfflineConfig', () => {
  it('defaults everything on with a 24 h grace', () => {
    expect(readOfflineConfig({})).toEqual({
      queueV2: true,
      cache: true,
      graceHours: 24,
    })
  })

  it('switches each path off only on an explicit "false"', () => {
    expect(
      readOfflineConfig({
        OFFLINE_QUEUE_V2_ENABLED: 'false',
        OFFLINE_CACHE_ENABLED: 'false',
        OFFLINE_GRACE_HOURS: '8',
      }),
    ).toEqual({ queueV2: false, cache: false, graceHours: 8 })
    expect(readOfflineConfig({ OFFLINE_QUEUE_V2_ENABLED: '0' }).queueV2).toBe(
      true,
    )
  })

  it('ignores an invalid grace value', () => {
    expect(readOfflineConfig({ OFFLINE_GRACE_HOURS: '-1' }).graceHours).toBe(24)
    expect(readOfflineConfig({ OFFLINE_GRACE_HOURS: 'abc' }).graceHours).toBe(
      24,
    )
  })
})
