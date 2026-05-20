// Builds a sorted, grouped list of IANA timezones from the browser's built-in
// Intl API — no external network call needed.

type TzEntry = {
  value: string
  label: string
  region: string
  offsetMinutes: number
}

function buildTzList(): TzEntry[] {
  let names: string[]
  try {
    names = Intl.supportedValuesOf('timeZone')
  } catch {
    // Fallback for environments that don't support the method (very old runtimes)
    names = [
      'Asia/Manila',
      'UTC',
      'America/New_York',
      'America/Los_Angeles',
      'Europe/London',
      'Europe/Paris',
      'Australia/Sydney',
    ]
  }

  const now = new Date()
  return names
    .map((tz) => {
      const offsetPart =
        new Intl.DateTimeFormat('en', {
          timeZone: tz,
          timeZoneName: 'shortOffset',
        })
          .formatToParts(now)
          .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'

      // Parse "GMT+8" / "GMT-5:30" → total minutes for sorting
      const m = offsetPart.match(/GMT([+-])(\d+)(?::(\d+))?/)
      const sign = m?.[1] === '-' ? -1 : 1
      const h = parseInt(m?.[2] ?? '0', 10)
      const min = parseInt(m?.[3] ?? '0', 10)
      const offsetMinutes = sign * (h * 60 + min)

      // Format offset as "(UTC+08:00)"
      const absH = Math.abs(offsetMinutes / 60) | 0
      const absM = Math.abs(offsetMinutes % 60)
      const sign2 = offsetMinutes >= 0 ? '+' : '-'
      const offsetLabel = `UTC${sign2}${String(absH).padStart(2, '0')}:${String(absM).padStart(2, '0')}`

      const region = tz.includes('/') ? tz.split('/')[0] : 'Other'
      const city = tz.replace(/_/g, ' ')

      return {
        value: tz,
        label: `(${offsetLabel}) ${city}`,
        region,
        offsetMinutes,
      }
    })
    .sort(
      (a, b) =>
        a.offsetMinutes - b.offsetMinutes || a.value.localeCompare(b.value),
    )
}

const TZ_LIST = buildTzList()

const REGION_ORDER = [
  'Africa',
  'America',
  'Antarctica',
  'Arctic',
  'Asia',
  'Atlantic',
  'Australia',
  'Europe',
  'Indian',
  'Pacific',
  'Etc',
  'Other',
]

type GroupedEntries = { region: string; entries: TzEntry[] }[]

function groupByRegion(list: TzEntry[]): GroupedEntries {
  const map = new Map<string, TzEntry[]>()
  for (const entry of list) {
    const existing = map.get(entry.region)
    if (existing) existing.push(entry)
    else map.set(entry.region, [entry])
  }
  return REGION_ORDER.filter((r) => map.has(r)).map((r) => ({
    region: r,
    entries: map.get(r)!,
  }))
}

const TZ_GROUPS = groupByRegion(TZ_LIST)

export function TimezoneSelect({
  value,
  onChange,
  className,
  id,
}: {
  value: string
  onChange: (tz: string) => void
  className?: string
  id?: string
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      {TZ_GROUPS.map(({ region, entries }) => (
        <optgroup key={region} label={region}>
          {entries.map((tz) => (
            <option key={tz.value} value={tz.value}>
              {tz.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
