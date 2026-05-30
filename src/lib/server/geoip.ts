const PRIVATE_IP_PREFIXES = [
  '192.168.',
  '10.',
  '172.16.',
  '172.17.',
  '172.18.',
  '172.19.',
  '172.20.',
  '172.21.',
  '172.22.',
  '172.23.',
  '172.24.',
  '172.25.',
  '172.26.',
  '172.27.',
  '172.28.',
  '172.29.',
  '172.30.',
  '172.31.',
  'fc',
  'fd',
]

function isPrivateIp(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true
  return PRIVATE_IP_PREFIXES.some((prefix) => ip.startsWith(prefix))
}

export async function geolocateIp(ip: string): Promise<string | null> {
  if (isPrivateIp(ip)) return null

  try {
    const token = process.env.IPINFO_TOKEN
    const url = token
      ? `https://ipinfo.io/${ip}?token=${token}`
      : `https://ipinfo.io/${ip}/json`

    const res = await fetch(url, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return null

    const data = (await res.json()) as Record<string, unknown>
    const parts = [data.city, data.region, data.country].filter(
      (v): v is string => typeof v === 'string' && v.length > 0,
    )
    return parts.length > 0 ? parts.join(', ') : null
  } catch {
    return null
  }
}
