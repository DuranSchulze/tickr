import { useEffect, useRef, useState } from 'react'

export function DescriptionAutocomplete({
  value,
  onChange,
  suggestions,
  onApplySuggestion,
  onSubmit,
  disabled = false,
  placeholder = 'What are you working on?',
}: {
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  onApplySuggestion: (description: string) => void
  onSubmit?: () => void
  disabled?: boolean
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={wrapperRef} className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit?.()
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder={placeholder}
        disabled={disabled}
        className="h-11 w-full rounded-lg border border-border bg-card text-foreground px-3 text-sm outline-none focus:border-primary disabled:bg-muted disabled:text-muted-foreground"
      />
      {open && suggestions.length > 0 && !disabled && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
          {suggestions.map((desc) => (
            <button
              key={desc}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                onApplySuggestion(desc)
                setOpen(false)
              }}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm text-foreground hover:bg-accent"
            >
              <span className="min-w-0 truncate">{desc}</span>
              <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                Use
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
