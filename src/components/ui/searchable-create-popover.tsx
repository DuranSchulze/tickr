import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, ChevronDown, Plus } from 'lucide-react'

export type SearchableItem = { id: string; name: string; color: string }

type CommonProps = {
  items: SearchableItem[]
  onCreate: (name: string, color: string) => Promise<void>
  disabled?: boolean
  /** When false, the "+ New …" footer is hidden. Defaults to true. */
  canCreate?: boolean
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
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const isSelected = (id: string) =>
    props.multi ? props.value.includes(id) : props.value === id

  const selectedItems = items.filter((i) => isSelected(i.id))

  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase()),
  )

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
      setSearch('')
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
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className="flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:border-border/80 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
      >
        <div className="flex flex-1 items-center gap-1 overflow-hidden">
          {renderTrigger(selectedItems)}
        </div>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-64 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          <div className="border-b border-border p-2">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 w-full rounded-lg border border-border bg-card text-foreground px-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
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
                    className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent ${
                      checked
                        ? 'font-semibold text-foreground'
                        : 'text-foreground'
                    }`}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="flex-1 truncate text-left">
                      {item.name}
                    </span>
                    {checked && <Check className="h-3.5 w-3.5 text-primary" />}
                  </button>
                )
              })
            )}
          </div>
          {canCreate && (
            <div className="border-t border-border p-2">
              {creating ? (
                <form onSubmit={handleCreate} className="grid gap-2">
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder={newNamePlaceholder}
                      className="h-8 flex-1 rounded-lg border border-border bg-card text-foreground px-2 text-sm outline-none focus:border-primary"
                    />
                    <input
                      type="color"
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      title="Pick a color"
                      className="h-8 w-10 cursor-pointer rounded-lg border border-border p-0.5"
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
                  <Plus className="h-3.5 w-3.5" />
                  {createLabel}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
