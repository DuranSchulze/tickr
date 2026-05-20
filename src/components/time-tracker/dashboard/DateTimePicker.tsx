import { useState } from 'react'
import { Calendar } from '#/components/ui/calendar'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { Button } from '#/components/ui/button'
import { CalendarIcon } from 'lucide-react'
import { cn } from '#/lib/utils'
import { format } from 'date-fns'

type DateTimePickerProps = {
  value: string // ISO datetime-local format (yyyy-MM-ddTHH:mm)
  onChange: (value: string) => void
  placeholder?: string
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = 'Pick date and time',
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false)

  const date = value ? new Date(value) : undefined
  const datePart = value ? value.split('T')[0] : ''
  const timePart = value ? value.split('T')[1] : '00:00'

  function handleDateSelect(newDate: Date | undefined) {
    if (!newDate) return

    const year = newDate.getFullYear()
    const month = String(newDate.getMonth() + 1).padStart(2, '0')
    const day = String(newDate.getDate()).padStart(2, '0')
    const newDateStr = `${year}-${month}-${day}T${timePart || '00:00'}`

    onChange(newDateStr)
  }

  function handleTimeChange(newTime: string) {
    if (!datePart) {
      const today = new Date()
      const year = today.getFullYear()
      const month = String(today.getMonth() + 1).padStart(2, '0')
      const day = String(today.getDate()).padStart(2, '0')
      onChange(`${year}-${month}-${day}T${newTime}`)
      return
    }
    onChange(`${datePart}T${newTime}`)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-10 w-full justify-start text-left font-normal',
            !date && 'text-muted-foreground',
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? (
            format(date, 'MMM d, yyyy h:mm a')
          ) : (
            <span>{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-3">
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleDateSelect}
            initialFocus
          />
          <div className="mt-3 border-t pt-3">
            <Label className="text-xs text-muted-foreground">Time</Label>
            <Input
              type="time"
              value={timePart || '00:00'}
              onChange={(e) => handleTimeChange(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
