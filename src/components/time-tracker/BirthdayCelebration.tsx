import { useEffect, useMemo, useState } from 'react'
import { Cake } from 'lucide-react'
import { Button } from '#/components/ui/button'

const DISMISSED_VALUE = 'dismissed'

const CONFETTI_PIECES = [
  { id: 'a', left: '4%', top: '16%', color: 'bg-rose-400', delay: '0s' },
  { id: 'b', left: '9%', top: '54%', color: 'bg-amber-400', delay: '0.2s' },
  { id: 'c', left: '14%', top: '28%', color: 'bg-sky-400', delay: '0.5s' },
  { id: 'd', left: '19%', top: '72%', color: 'bg-emerald-400', delay: '0.1s' },
  { id: 'e', left: '25%', top: '18%', color: 'bg-violet-400', delay: '0.4s' },
  { id: 'f', left: '31%', top: '62%', color: 'bg-pink-400', delay: '0.7s' },
  { id: 'g', left: '37%', top: '36%', color: 'bg-amber-300', delay: '0.3s' },
  { id: 'h', left: '43%', top: '74%', color: 'bg-cyan-400', delay: '0.6s' },
  { id: 'i', left: '49%', top: '20%', color: 'bg-lime-400', delay: '0.15s' },
  { id: 'j', left: '55%', top: '58%', color: 'bg-rose-300', delay: '0.45s' },
  { id: 'k', left: '61%', top: '34%', color: 'bg-blue-400', delay: '0.9s' },
  { id: 'l', left: '67%', top: '70%', color: 'bg-fuchsia-400', delay: '0.25s' },
  { id: 'm', left: '73%', top: '24%', color: 'bg-yellow-300', delay: '0.55s' },
  { id: 'n', left: '79%', top: '64%', color: 'bg-teal-400', delay: '0.8s' },
  { id: 'o', left: '85%', top: '38%', color: 'bg-orange-400', delay: '0.35s' },
  { id: 'p', left: '91%', top: '76%', color: 'bg-indigo-400', delay: '0.65s' },
  { id: 'q', left: '96%', top: '22%', color: 'bg-red-300', delay: '0.95s' },
] as const

export function isBirthdayToday(birthDate: string, today = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(year, month - 1, day)

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return false
  }

  return today.getMonth() + 1 === month && today.getDate() === day
}

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function BirthdayCelebration({
  birthDate,
  userId,
  userName,
}: {
  birthDate?: string | null
  userId: string
  userName: string
}) {
  const [today, setToday] = useState<Date | null>(null)
  const birthdayToday = today ? isBirthdayToday(birthDate ?? '', today) : false
  const todayKey = today ? getLocalDateKey(today) : ''
  const storageKey = useMemo(
    () => `tickr:birthday-greeting:${userId}:${todayKey}`,
    [todayKey, userId],
  )
  const [showGreeting, setShowGreeting] = useState(false)

  useEffect(() => {
    setToday(new Date())
  }, [])

  useEffect(() => {
    if (!birthdayToday) {
      setShowGreeting(false)
      return
    }

    try {
      setShowGreeting(
        window.localStorage.getItem(storageKey) !== DISMISSED_VALUE,
      )
    } catch {
      setShowGreeting(true)
    }
  }, [birthdayToday, storageKey])

  function dismissGreeting() {
    try {
      window.localStorage.setItem(storageKey, DISMISSED_VALUE)
    } catch {
      // Storage can fail in private browsing; dismiss for this render anyway.
    }
    setShowGreeting(false)
  }

  if (!birthdayToday) return null

  return (
    <>
      <div
        aria-hidden
        className="birthday-confetti pointer-events-none fixed inset-x-0 top-0 z-30 h-28 overflow-hidden print:hidden"
      >
        {CONFETTI_PIECES.map((piece) => (
          <span
            key={piece.id}
            className={`birthday-confetti-piece absolute block size-1.5 rounded-[2px] opacity-65 sm:size-2 ${piece.color}`}
            style={{
              left: piece.left,
              top: piece.top,
              animationDelay: piece.delay,
            }}
          />
        ))}
      </div>

      {showGreeting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/35 backdrop-blur-sm"
            onClick={dismissGreeting}
            aria-label="Close birthday greeting"
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-xl">
            <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
              <Cake className="size-6" />
            </div>
            <h2 className="m-0 text-xl font-black text-foreground">
              Happy birthday, {userName}!
            </h2>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted-foreground">
              Hope today treats you kindly. Enjoy the little celebration.
            </p>
            <Button
              type="button"
              className="mt-5 w-full"
              onClick={dismissGreeting}
            >
              Thanks!
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
