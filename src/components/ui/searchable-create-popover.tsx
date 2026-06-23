import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, ChevronDown, Plus } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

export type SearchableItem = { id: string; name: string; color: string }

// Cap how many items mount at once. Opening the popover commits every row
// synchronously, so an uncapped list is what makes a large catalog slow.
const MAX_VISIBLE_ITEMS = 50

type CommonProps = {
  items: SearchableItem[]
  onCreate: (name: string, color: string) => Promise<void>
  disabled?: boolean
  /** When false, the "+ New …" footer is hidden. Defaults to true. */
  canCreate?: boolean
  /** Borderless trigger variant for use inside the unified timer bar / rows. */
  bare?: boolean
  searchPlaceholder?: string
  emptyText?: string
  createLabel: string
  newNamePlaceholder: string
  defaultColor: string
  renderTrigger: (selected: SearchableItem[]) => ReactNode
}

type SingleProps = CommonProps & {
  multi?: false
  value: string
  onChange: (id: string) => void
}

type MultiProps = CommonProps & {
  multi: true
  value: string[]
  onChange: (ids: string[]) => void
}

export function SearchableCreatePopover(props: SingleProps | MultiProps) {
  const {
    items,
    onCreate,
    disabled = false,
    canCreate = true,
    bare = false,
    searchPlaceholder = 'Search…',
    emptyText = 'Nothing found',
    createLabel,
    newNamePlaceholder,
    defaultColor,
    renderTrigger,
  } = props

  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(defaultColor)
  const [createPending, setCreatePending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setSearch('')
      setCreating(false)
    }
  }

  const isSelected = (id: string) =>
    props.multi ? props.value.includes(id) : props.value === id

  const value = props.value
  const multi = props.multi
  const selectedItems = useMemo(
    () => items.filter((i) => (multi ? value.includes(i.id) : value === i.id)),
    [items, multi, value],
  )

  // Only filter while the dropdown is open — closed pickers shouldn't pay for
  // every parent re-render. Capped so a large catalog doesn't commit every row
  // at once on open; the search box narrows the rest.
  const { filtered, truncated } = useMemo(() => {
    if (!open) return { filtered: [] as SearchableItem[], truncated: false }
    const q = search.toLowerCase()
    const matches = items.filter((i) => i.name.toLowerCase().includes(q))
    return {
      filtered: matches.slice(0, MAX_VISIBLE_ITEMS),
      truncated: matches.length > MAX_VISIBLE_ITEMS,
    }
  }, [open, items, search])

  function handleSelect(id: string) {
    if (props.multi) {
      props.onChange(
        props.value.includes(id)
          ? props.value.filter((v) => v !== id)
          : [...props.value, id],
      )
    } else {
      props.onChange(id)
      setOpen(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreatePending(true)
    try {
      await onCreate(newName.trim(), newColor)
      setNewName('')
      setNewColor(defaultColor)
      setCreating(false)
      if (!props.multi) setOpen(false)
    } finally {
      setCreatePending(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={
            bare
              ? 'flex h-full w-full items-center gap-2 px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent/50 disabled:cursor-not-allowed disabled:text-muted-foreground'
              : 'flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:border-border/80 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground'
          }
        >
          <div className="flex flex-1 items-center gap-1 overflow-hidden">
            {renderTrigger(selectedItems)}
          </div>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      {/* Dropdown — rendered in a portal so it's never clipped by an
          overflow-hidden ancestor (timer bar) or overflow-x-auto table. */}
      <PopoverContent
        align="start"
        sideOffset={4}
        collisionPadding={8}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          inputRef.current?.focus()
        }}
        className="max-h-[min(var(--radix-popover-content-available-height),calc(100dvh-1rem))] w-[min(22rem,calc(100vw-1rem))] gap-0 overflow-hidden rounded-xl border border-border bg-card p-0 shadow-xl"
      >
        <div className="border-b border-border p-2">
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-10 w-full scroll-mt-24 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary sm:h-8"
          />
        </div>
        <div className="max-h-[min(18rem,calc(100dvh-12rem))] overflow-y-auto overscroll-contain py-1 [touch-action:pan-y] [-webkit-overflow-scrolling:touch]">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {emptyText}
            </p>
          ) : (
            filtered.map((item) => {
              const checked = isSelected(item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item.id)}
                  className={`flex min-h-10 w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent sm:min-h-0 ${
                    checked
                      ? 'font-semibold text-foreground'
                      : 'text-foreground'
                  }`}
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="flex-1 truncate text-left">{item.name}</span>
                  {checked && <Check className="size-3.5 text-primary" />}
                </button>
              )
            })
          )}
          {truncated && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Showing first {MAX_VISIBLE_ITEMS} — type to narrow results.
            </p>
          )}
        </div>
        {canCreate && (
          <div className="border-t border-border p-2">
            {creating ? (
              <form onSubmit={handleCreate} className="grid gap-2">
                <div className="flex gap-2">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={newNamePlaceholder}
                    aria-label={newNamePlaceholder}
                    className="h-10 flex-1 scroll-mt-24 rounded-lg border border-border bg-card px-2 text-sm text-foreground outline-none focus:border-primary sm:h-8"
                  />
                  <input
                    type="color"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    title="Pick a color"
                    aria-label="Color"
                    className="h-8 w-10 cursor-pointer rounded-lg border border-border bg-card p-0.5"
                  />
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="submit"
                    disabled={createPending || !newName.trim()}
                    className="flex-1 rounded-lg bg-primary py-1.5 text-xs font-bold text-primary-foreground hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground"
                  >
                    {createPending ? 'Creating…' : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreating(false)
                      setNewName('')
                    }}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-primary hover:bg-primary/15"
              >
                <Plus className="size-3.5" />
                {createLabel}
              </button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
