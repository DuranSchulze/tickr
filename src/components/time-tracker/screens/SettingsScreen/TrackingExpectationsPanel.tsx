import { useMemo, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { CalendarRange, Minus, Plus, Target } from 'lucide-react'
import { updateWorkspaceSettingsFn } from '#/lib/server/tracker'
import type { Workspace } from '#/lib/time-tracker/types'
import { buildPayrollPeriods } from '#/lib/time-tracker/payroll-periods'
import { dateKeyInTimeZone } from '#/lib/time-tracker/timesheet'
import { gooeyToast } from '#/lib/toast'
import { cn } from '#/lib/utils'

const HOUR_PRESETS = [7, 8, 9] as const
const CUTOFF_PRESETS = [
  { id: 'mid', label: '15th & month-end', days: [15] },
  { id: 'tri', label: '10th & 20th & month-end', days: [10, 20] },
] as const
const MAX_CUTOFF_DAYS = 6

function formatHours(hours: number): string {
  return String(hours)
}

function isValidHours(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= 1 &&
    value <= 24 &&
    Math.round(value * 2) === value * 2
  )
}

function sameDays(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((day, i) => day === b[i])
}

export function TrackingExpectationsPanel({
  workspace,
}: {
  workspace: Workspace
}) {
  const router = useRouter()
  const [hoursText, setHoursText] = useState(() =>
    formatHours(workspace.expectedDailyHours),
  )
  const [cutoffDays, setCutoffDays] = useState(() => [
    ...workspace.payrollCutoffDays,
  ])
  const [pending, setPending] = useState(false)

  const hours = Number(hoursText)
  const hoursValid = isValidHours(hours)
  const cutoffCountValid =
    cutoffDays.length >= 1 && cutoffDays.length <= MAX_CUTOFF_DAYS
  const dirty =
    hoursValid &&
    (hours !== workspace.expectedDailyHours ||
      !sameDays(cutoffDays, workspace.payrollCutoffDays))
  const canSave = dirty && cutoffCountValid && !pending

  const { periods, todayKey } = useMemo(() => {
    const today = dateKeyInTimeZone(new Date(), workspace.timezone)
    return {
      todayKey: today,
      periods: buildPayrollPeriods(
        cutoffDays,
        today.slice(0, 7),
        workspace.timezone,
      ),
    }
  }, [cutoffDays, workspace.timezone])

  function stepHours(delta: number) {
    const base = hoursValid ? hours : workspace.expectedDailyHours
    const next = Math.min(24, Math.max(1, Math.round((base + delta) * 2) / 2))
    setHoursText(formatHours(next))
  }

  function toggleCutoffDay(day: number) {
    setCutoffDays((current) =>
      current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort((a, b) => a - b),
    )
  }

  function applyPreset(days: readonly number[]) {
    setCutoffDays([...days].sort((a, b) => a - b))
  }

  function resetForm() {
    setHoursText(formatHours(workspace.expectedDailyHours))
    setCutoffDays([...workspace.payrollCutoffDays])
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!canSave) return
    setPending(true)
    try {
      await updateWorkspaceSettingsFn({
        data: { expectedDailyHours: hours, payrollCutoffDays: cutoffDays },
      })
      await router.invalidate()
      gooeyToast.success('Tracking expectations saved')
    } catch (err) {
      gooeyToast.error('Could not save tracking expectations', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  const activePreset = CUTOFF_PRESETS.find((preset) =>
    sameDays(cutoffDays, preset.days),
  )

  return (
    <section className="rounded-lg border border-stone bg-eggshell p-5 shadow-[var(--shadow-whisper)]">
      <div className="flex items-start gap-2">
        <Target className="mt-0.5 size-4 text-primary" aria-hidden="true" />
        <div>
          <h2 className="m-0 text-base font-bold text-foreground">
            Working hours & payroll
          </h2>
          <p className="m-0 mt-1 max-w-2xl text-sm text-smoke">
            Set what a full working day looks like and when pay periods close.
            Used for consistency and KPI grading. Same for all members.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="mt-5 grid gap-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <fieldset className="grid gap-2">
            <legend className="text-xs font-semibold text-foreground">
              Expected hours per work day
            </legend>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => stepHours(-0.5)}
                disabled={pending}
                aria-label="Decrease expected hours by half an hour"
                className="grid size-9 shrink-0 place-items-center rounded-lg border border-stone text-foreground hover:bg-accent disabled:opacity-50"
              >
                <Minus className="size-4" aria-hidden="true" />
              </button>
              <input
                value={hoursText}
                onChange={(e) => setHoursText(e.target.value)}
                onBlur={() => {
                  if (hoursValid) setHoursText(formatHours(hours))
                }}
                inputMode="decimal"
                aria-invalid={!hoursValid}
                aria-describedby="expected-hours-hint"
                className={cn(
                  'h-9 w-20 rounded-lg border bg-eggshell px-3 text-center text-sm text-foreground outline-none focus:border-primary',
                  hoursValid ? 'border-stone' : 'border-destructive',
                )}
              />
              <button
                type="button"
                onClick={() => stepHours(0.5)}
                disabled={pending}
                aria-label="Increase expected hours by half an hour"
                className="grid size-9 shrink-0 place-items-center rounded-lg border border-stone text-foreground hover:bg-accent disabled:opacity-50"
              >
                <Plus className="size-4" aria-hidden="true" />
              </button>
              <span className="text-sm text-smoke">hours / day</span>
            </div>
            <div className="flex items-center gap-1.5">
              {HOUR_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setHoursText(formatHours(preset))}
                  disabled={pending}
                  aria-pressed={hoursValid && hours === preset}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50',
                    hoursValid && hours === preset
                      ? 'bg-primary-action text-primary-action-foreground'
                      : 'bg-muted text-smoke hover:bg-accent',
                  )}
                >
                  {preset}h
                </button>
              ))}
            </div>
            <p
              id="expected-hours-hint"
              className={cn(
                'm-0 text-xs',
                hoursValid ? 'text-smoke' : 'text-destructive',
              )}
            >
              {hoursValid
                ? 'Half-hour steps, between 1 and 24.'
                : 'Enter a number between 1 and 24 in 0.5 steps.'}
            </p>
          </fieldset>

          <fieldset className="grid gap-2">
            <legend className="text-xs font-semibold text-foreground">
              Payroll cutoff days
            </legend>
            <div className="flex flex-wrap items-center gap-1.5">
              {CUTOFF_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.days)}
                  disabled={pending}
                  aria-pressed={activePreset?.id === preset.id}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50',
                    activePreset?.id === preset.id
                      ? 'bg-primary-action text-primary-action-foreground'
                      : 'bg-muted text-smoke hover:bg-accent',
                  )}
                >
                  {preset.label}
                </button>
              ))}
              {!activePreset && (
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  Custom
                </span>
              )}
            </div>
            <div
              role="group"
              aria-label="Payroll cutoff days of the month"
              className="mt-1 grid grid-cols-7 gap-1.5"
            >
              {Array.from({ length: 28 }, (_, index) => index + 1).map(
                (day) => {
                  const selected = cutoffDays.includes(day)
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleCutoffDay(day)}
                      disabled={pending}
                      aria-pressed={selected}
                      className={cn(
                        'h-8 rounded-md border text-xs font-semibold transition-colors disabled:opacity-50',
                        selected
                          ? 'border-primary bg-primary-action text-primary-action-foreground'
                          : 'border-stone bg-eggshell text-smoke hover:bg-accent',
                      )}
                    >
                      {day}
                    </button>
                  )
                },
              )}
            </div>
            <p
              className={cn(
                'm-0 text-xs',
                cutoffCountValid ? 'text-smoke' : 'text-destructive',
              )}
            >
              {cutoffDays.length === 0
                ? 'Pick at least one cutoff day.'
                : cutoffDays.length > MAX_CUTOFF_DAYS
                  ? `Pick at most ${MAX_CUTOFF_DAYS} cutoff days.`
                  : 'A period closes on each cutoff day; the last period always closes at month-end.'}
            </p>
          </fieldset>
        </div>

        <div className="rounded-lg border border-stone bg-muted/35 p-4">
          <div className="flex items-center gap-2">
            <CalendarRange className="size-4 text-primary" aria-hidden="true" />
            <h3 className="m-0 text-sm font-bold text-foreground">
              Payroll period preview
            </h3>
          </div>
          <p className="m-0 mt-1 text-xs text-smoke">
            The periods this configuration produces for the current month in{' '}
            {workspace.timezone}.
          </p>
          <ul className="mt-3 grid list-none gap-2 p-0 sm:grid-cols-2 xl:grid-cols-3">
            {periods.map((period) => {
              const isCurrent =
                period.startDate <= todayKey && todayKey <= period.endDate
              return (
                <li
                  key={period.startDate}
                  className="flex items-center justify-between gap-2 rounded-lg border border-stone bg-eggshell px-3 py-2"
                >
                  <span className="text-sm font-semibold text-foreground">
                    {period.label}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
                      isCurrent
                        ? 'bg-primary/10 text-primary'
                        : period.closed
                          ? 'bg-muted text-smoke'
                          : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                    )}
                  >
                    {isCurrent ? 'Current' : period.closed ? 'Closed' : 'Open'}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!canSave}
            className="h-9 rounded-lg bg-primary-action px-4 text-sm font-bold text-primary-action-foreground transition-colors disabled:bg-muted disabled:text-smoke"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={resetForm}
            disabled={pending || (!dirty && hoursValid)}
            className="h-9 rounded-lg border border-stone px-4 text-sm font-semibold text-foreground hover:bg-accent disabled:opacity-50"
          >
            Reset
          </button>
        </div>
      </form>
    </section>
  )
}
