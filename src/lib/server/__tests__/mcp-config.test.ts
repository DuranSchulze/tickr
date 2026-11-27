import { afterEach, describe, expect, it, vi } from 'vitest'
import { isMcpEnabled, isMcpPilotUser } from '../integrations/mcp-config.server'

afterEach(() => vi.unstubAllEnvs())

describe('MCP pilot flags', () => {
  it('is disabled by default', () => {
    vi.stubEnv('MCP_ENABLED', '')
    vi.stubEnv('MCP_PILOT_USER_IDS', 'u1')
    expect(isMcpEnabled()).toBe(false)
    expect(isMcpPilotUser('u1')).toBe(false)
  })

  it.each(['1', 'TRUE', 'yes'])('treats %s as disabled', (value) => {
    vi.stubEnv('MCP_ENABLED', value)
    expect(isMcpEnabled()).toBe(false)
  })

  it('admits nobody when enabled with an empty pilot list', () => {
    vi.stubEnv('MCP_ENABLED', 'true')
    vi.stubEnv('MCP_PILOT_USER_IDS', ' , ')
    expect(isMcpEnabled()).toBe(true)
    expect(isMcpPilotUser('u1')).toBe(false)
  })

  it('admits only listed pilot users', () => {
    vi.stubEnv('MCP_ENABLED', 'true')
    vi.stubEnv('MCP_PILOT_USER_IDS', 'u1, u2')
    expect(isMcpPilotUser('u1')).toBe(true)
    expect(isMcpPilotUser('u2')).toBe(true)
    expect(isMcpPilotUser('u3')).toBe(false)
  })
})
