import { useState } from 'react'
import { Cake, X } from 'lucide-react'
import { Calendar } from '#/components/ui/calendar'
import { Button } from '#/components/ui/button'

const BIRTHDAY_PICKER_DEFAULT_MONTH = new Date(2001, 0, 1)

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function dateToStr(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function BirthdayDialog({
  currentBirthDate,
  onChange,
  onClose,
}: {
  currentBirthDate: string
  onChange: (dateStr: string) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Date | undefined>(
    currentBirthDate ? new Date(currentBirthDate + 'T00:00:00') : undefined,
  )

  function handleClear() {
    setSelected(undefined)
    onChange('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cake className="size-5 text-foreground" />
            <h3 className="m-0 text-base font-bold text-foreground">
              Birthday
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="mb-4 text-center text-sm text-muted-foreground">
          {selected ? formatDate(dateToStr(selected)) : 'Not set'}
        </p>

        <div className="flex justify-center">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) => {
              setSelected(date)
              onChange(date ? dateToStr(date) : '')
            }}
            defaultMonth={BIRTHDAY_PICKER_DEFAULT_MONTH}
            captionLayout="dropdown"
            fromYear={1920}
            toYear={new Date().getFullYear()}
            disabled={{ after: new Date() }}
          />
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClear}
          >
            Clear
          </Button>
          <Button type="button" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
