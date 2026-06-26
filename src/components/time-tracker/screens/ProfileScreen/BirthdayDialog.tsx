import { useMemo, useState } from 'react'
import { AlertTriangle, Cake, X } from 'lucide-react'
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
  onSave,
  onClose,
}: {
  currentBirthDate: string
  onSave: (dateStr: string) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Date | undefined>(
    currentBirthDate ? new Date(currentBirthDate + 'T00:00:00') : undefined,
  )

  const hasChanges = useMemo(() => {
    const current = selected ? dateToStr(selected) : ''
    return current !== currentBirthDate
  }, [selected, currentBirthDate])

  const [confirmClose, setConfirmClose] = useState(false)

  function handleClose() {
    if (hasChanges && !confirmClose) {
      setConfirmClose(true)
    } else {
      onClose()
    }
  }

  function handleSave() {
    if (!hasChanges) {
      onClose()
      return
    }
    if (!selected) {
      onSave('')
      return
    }
    onSave(dateToStr(selected))
  }

  function handleClear() {
    onSave('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
        aria-label="Close"
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
        {/* Confirmation prompt overlay */}
        {confirmClose ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <AlertTriangle className="size-10 text-amber-500" />
            <p className="text-center text-sm text-foreground">
              You have unsaved changes. Discard them?
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirmClose(false)}
              >
                Keep editing
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={onClose}
              >
                Discard
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cake className="size-5 text-foreground" />
                <h3 className="m-0 text-base font-bold text-foreground">
                  Birthday
                </h3>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {selected && (
              <p className="mb-4 text-center text-sm text-muted-foreground">
                {formatDate(dateToStr(selected))}
              </p>
            )}

            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={selected}
                onSelect={setSelected}
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
              <Button type="button" size="sm" onClick={handleSave}>
                {hasChanges ? 'Save' : 'Done'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
