import { useState } from 'react'

export const inputClass =
  'h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary'

export function SubmitButton({
  pending,
  label,
  pendingLabel = 'Saving...',
}: {
  pending: boolean
  label: string
  pendingLabel?: string
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-10 flex-1 rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground transition-colors hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground"
    >
      {pending ? pendingLabel : label}
    </button>
  )
}

export function CancelButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-10 rounded-lg border border-border px-4 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      Cancel
    </button>
  )
}

export function FormTitle({ title }: { title: string }) {
  return <h3 className="m-0 text-sm font-bold text-foreground">{title}</h3>
}

export function ClientSelect({
  clients,
  value,
  onChange,
}: {
  clients: { id: string; name: string; clientStatus: string }[]
  value: string
  onChange: (id: string) => void
}) {
  const [search, setSearch] = useState('')
  const filtered = clients.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()),
  )
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search clients…"
        className="w-full border-b border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary"
      />
      <div className="max-h-40 overflow-y-auto">
        {filtered.map((c) => (
          <button
            type="button"
            key={c.id}
            onClick={() => onChange(c.id)}
            className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
              value === c.id
                ? 'bg-primary/10 font-semibold text-primary'
                : 'text-foreground'
            }`}
          >
            {c.name}
            {c.clientStatus === 'INACTIVE' ? (
              <span className="ml-1 text-xs text-muted-foreground">
                (inactive)
              </span>
            ) : null}
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            No clients match
          </p>
        )}
      </div>
    </div>
  )
}

export function ColorInput({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm font-semibold text-foreground">
      Color
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-14 cursor-pointer rounded-lg border border-border p-1"
      />
    </label>
  )
}

export function ModeToggle({
  mode,
  onChange,
}: {
  mode: 'single' | 'bulk'
  onChange: (m: 'single' | 'bulk') => void
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-border text-xs font-semibold">
      <button
        type="button"
        onClick={() => onChange('single')}
        className={`flex-1 py-1.5 transition-colors ${
          mode === 'single'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent'
        }`}
      >
        Single
      </button>
      <button
        type="button"
        onClick={() => onChange('bulk')}
        className={`flex-1 py-1.5 transition-colors ${
          mode === 'bulk'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent'
        }`}
      >
        Bulk
      </button>
    </div>
  )
}

export function BulkNamesInput({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={'One name per line…\nName A\nName B\nName C'}
      rows={5}
      required
      className="resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
    />
  )
}
