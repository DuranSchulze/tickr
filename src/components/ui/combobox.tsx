import { useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { cn } from '#/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

export type ComboboxOption = {
  value: string
  label: string
  description?: string
  disabled?: boolean
}

type ComboboxProps = {
  options: ComboboxOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
  contentClassName?: string
  maxVisibleOptions?: number
}

export function filterComboboxOptions(
  options: ComboboxOption[],
  search: string,
  maxVisibleOptions: number,
) {
  const query = search.trim().toLowerCase()
  const matches = query
    ? options.filter((option) => {
        const haystack = `${option.label} ${option.description ?? ''}`
        return haystack.toLowerCase().includes(query)
      })
    : options

  return {
    filteredOptions: matches.slice(0, maxVisibleOptions),
    truncated: matches.length > maxVisibleOptions,
  }
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = 'Select an option',
  searchPlaceholder = 'Search...',
  emptyText = 'No results found.',
  disabled = false,
  className,
  contentClassName,
  maxVisibleOptions = 80,
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedOption = options.find((option) => option.value === value)

  const { filteredOptions, truncated } = useMemo(() => {
    if (!open) {
      return { filteredOptions: [] as ComboboxOption[], truncated: false }
    }

    return filterComboboxOptions(options, search, maxVisibleOptions)
  }, [maxVisibleOptions, open, options, search])

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) setSearch('')
  }

  function handleSelect(nextValue: string) {
    onValueChange(nextValue)
    setOpen(false)
    setSearch('')
  }

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-expanded={open}
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 text-left text-sm text-foreground outline-none transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              !selectedOption && 'text-muted-foreground',
            )}
          >
            {selectedOption?.label ?? placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        collisionPadding={8}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          inputRef.current?.focus()
        }}
        className={cn(
          'max-h-[min(var(--radix-popover-content-available-height),20rem)] w-[var(--radix-popover-trigger-width)] min-w-[min(18rem,calc(100vw-2rem))] gap-0 overflow-hidden rounded-md border border-border bg-popover p-0 shadow-none',
          contentClassName,
        )}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-8 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="max-h-[min(calc(var(--radix-popover-content-available-height)-3.5rem),16rem)] overflow-y-auto overscroll-contain py-1 [touch-action:pan-y] [-webkit-overflow-scrolling:touch]">
          {filteredOptions.length === 0 ? (
            <p className="m-0 px-3 py-3 text-sm text-muted-foreground">
              {emptyText}
            </p>
          ) : (
            filteredOptions.map((option) => {
              const selected = option.value === value
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={option.disabled}
                  onClick={() => handleSelect(option.value)}
                  className={cn(
                    'flex min-h-10 w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50',
                    selected && 'font-semibold text-foreground',
                  )}
                >
                  <Check
                    className={cn(
                      'size-4 shrink-0 text-primary',
                      !selected && 'opacity-0',
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{option.label}</span>
                    {option.description && (
                      <span className="block truncate text-xs font-normal text-muted-foreground">
                        {option.description}
                      </span>
                    )}
                  </span>
                </button>
              )
            })
          )}
          {truncated && (
            <p className="m-0 border-t border-border px-3 py-2 text-xs text-muted-foreground">
              Showing first {maxVisibleOptions}. Type to narrow results.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
