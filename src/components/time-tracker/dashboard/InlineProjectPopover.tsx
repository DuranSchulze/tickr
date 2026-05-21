import { useState } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import type { SearchableItem } from '#/components/ui/searchable-create-popover'

export function InlineProjectPopover({
  projects,
  value,
  onChange,
  disabled,
}: {
  projects: SearchableItem[]
  value: string
  onChange: (id: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = projects.find((p) => p.id === value)
  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex items-center gap-1.5 rounded px-1.5 py-1 text-sm text-left transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 max-w-[160px]"
        >
          {selected ? (
            <>
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: selected.color }}
              />
              <span className="truncate text-foreground">{selected.name}</span>
            </>
          ) : (
            <span className="text-muted-foreground">No project</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-2" align="start">
        <input
          autoFocus
          className="mb-2 w-full rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary"
          placeholder="Search projects…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="max-h-48 overflow-y-auto">
          <button
            type="button"
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors hover:bg-accent ${!value ? 'bg-accent' : ''}`}
            onClick={() => {
              onChange('')
              setOpen(false)
              setQuery('')
            }}
          >
            <span className="h-2 w-2 rounded-full shrink-0 bg-muted-foreground/30" />
            <span className="text-muted-foreground">No project</span>
          </button>
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors hover:bg-accent ${value === p.id ? 'bg-accent font-semibold' : ''}`}
              onClick={() => {
                onChange(p.id)
                setOpen(false)
                setQuery('')
              }}
            >
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: p.color }}
              />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              No projects found
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
