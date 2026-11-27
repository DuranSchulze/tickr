import '@tanstack/react-start/server-only'

/**
 * Read-only MCP pilot switches. Both default to closed: the integration is off
 * unless `MCP_ENABLED=true`, and even then only users listed in
 * `MCP_PILOT_USER_IDS` may authorize or call it. Unlike the weekly-report
 * workspace list, an empty pilot list admits nobody.
 */
export function isMcpEnabled(): boolean {
  return process.env.MCP_ENABLED === 'true'
}

function pilotUserIds(): Set<string> {
  return new Set(
    (process.env.MCP_PILOT_USER_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  )
}

export function isMcpPilotUser(userId: string): boolean {
  return isMcpEnabled() && pilotUserIds().has(userId)
}
