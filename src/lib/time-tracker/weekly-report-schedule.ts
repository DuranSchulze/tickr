/** Calendar arithmetic uses local date keys; UTC conversion iterates across DST offsets. */
function localParts(date: Date, timezone: string) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  )
}
function localUtc(date: string, hour: number, timezone: string) {
  const target = Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00Z`)
  let guess = target
  for (let i = 0; i < 4; i++) {
    const p = localParts(new Date(guess), timezone)
    const represented = Date.parse(
      `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`,
    )
    const delta = target - represented
    if (!delta) break
    guess += delta
  }
  return new Date(guess)
}
export function shiftDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10)
}
export function nextWeeklyReport(now: Date, timezone: string) {
  const p = localParts(now, timezone)
  const date = `${p.year}-${p.month}-${p.day}`
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  let sunday = shiftDate(date, -day)
  let dueAt = localUtc(sunday, 8, timezone)
  if (dueAt <= now) {
    sunday = shiftDate(sunday, 7)
    dueAt = localUtc(sunday, 8, timezone)
  }
  return {
    dueAt: dueAt.toISOString(),
    weekStart: shiftDate(sunday, -7),
    weekEnd: shiftDate(sunday, -1),
  }
}
export function retryDelayMs(attempt: number, retryAfterSeconds = 0) {
  return Math.max(
    60_000 * 2 ** Math.max(0, attempt - 1),
    retryAfterSeconds * 1000,
  )
}
export function retryAllowed(
  attempts: number,
  firstAttemptAt: Date,
  nextAttemptAt: Date,
) {
  return (
    attempts < 5 &&
    nextAttemptAt.getTime() < firstAttemptAt.getTime() + 20 * 3600000
  )
}
