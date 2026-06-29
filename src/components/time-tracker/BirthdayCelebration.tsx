import { useEffect, useMemo, useRef, useState } from 'react'
import { Cake } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Confetti, fireSideCannons } from '#/components/ui/confetti'
import type { ConfettiRef } from '#/components/ui/confetti'

const DISMISSED_VALUE = 'dismissed'

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
  const confettiRef = useRef<ConfettiRef>(null)
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

  useEffect(() => {
    if (!birthdayToday) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const fireBurst = () => {
      confettiRef.current?.fire({
        particleCount: 6,
        spread: 24,
        startVelocity: 14,
        gravity: 0.7,
        ticks: 90,
        scalar: 0.55,
        origin: { x: 0.16, y: 0.72 },
        colors: ['#f59e0b', '#fb7185', '#60a5fa', '#34d399'],
      })
      confettiRef.current?.fire({
        particleCount: 6,
        spread: 24,
        startVelocity: 14,
        gravity: 0.7,
        ticks: 90,
        scalar: 0.55,
        origin: { x: 0.84, y: 0.72 },
        colors: ['#f59e0b', '#fb7185', '#60a5fa', '#34d399'],
      })
    }

    fireBurst()
    const intervalId = window.setInterval(fireBurst, 9000)
    return () => window.clearInterval(intervalId)
  }, [birthdayToday])

  function dismissGreeting() {
    try {
      window.localStorage.setItem(storageKey, DISMISSED_VALUE)
    } catch {
      // Storage can fail in private browsing; dismiss for this render anyway.
    }
    setShowGreeting(false)
  }

  function triggerSideCelebration() {
    fireSideCannons({ durationMs: 1400, particleCount: 2 })
  }

  if (!birthdayToday) return null

  return (
    <>
      <Confetti
        ref={confettiRef}
        manualstart
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-16 w-full opacity-65 print:hidden"
      />

      {showGreeting && (
        <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center px-3 print:hidden">
          <div
            role="button"
            tabIndex={0}
            onClick={triggerSideCelebration}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                triggerSideCelebration()
              }
            }}
            className="pointer-events-auto flex max-w-[min(32rem,calc(100vw-1.5rem))] items-center gap-3 rounded-full border border-amber-200/70 bg-background/95 px-3 py-2 text-left shadow-lg backdrop-blur transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700">
              <Cake className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="m-0 truncate text-sm font-bold text-foreground">
                Happy birthday, {userName}!
              </p>
              <p className="m-0 truncate text-xs text-muted-foreground">
                Enjoy the little celebration.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="shrink-0 rounded-full"
              onClick={(event) => {
                event.stopPropagation()
                dismissGreeting()
              }}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
