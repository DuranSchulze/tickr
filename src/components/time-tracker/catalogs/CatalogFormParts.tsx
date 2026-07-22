import { Combobox } from '#/components/ui/combobox'

export const inputClass =
  'h-11 w-full min-w-0 rounded-lg border border-border bg-background px-3.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50'

export const catalogFormClass = 'grid gap-4'
export const catalogFormActionsClass = 'grid grid-cols-2 gap-3 pt-1'

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
      className="h-11 w-full rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
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
      className="h-11 w-full rounded-lg border border-border bg-background px-4 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
    >
      Cancel
    </button>
  )
}

export function FormTitle({ title }: { title: string }) {
  return <h3 className="sr-only">{title}</h3>
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
  return (
    <Combobox
      options={clients.map((client) => ({
        value: client.id,
        label: client.name,
        description:
          client.clientStatus === 'SUSPENDED'
            ? 'Suspended'
            : client.clientStatus === 'INACTIVE'
              ? 'Inactive'
              : undefined,
      }))}
      value={value}
      onValueChange={onChange}
      placeholder="Choose a client"
      searchPlaceholder="Search clients…"
      emptyText="No clients match."
      className="h-11 rounded-lg bg-background"
      contentClassName="z-[60]"
    />
  )
}

export function SuspendedClientWarning({ clientName }: { clientName: string }) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800">
      <span className="font-semibold">{clientName} is suspended.</span> Time
      entries will still be saved, but this client may be on hold.
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
    <label className="flex h-11 items-center justify-between gap-3 rounded-lg border border-border bg-background px-3.5 text-sm font-semibold text-foreground">
      <span>Color</span>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 w-12 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
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
    <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm font-semibold">
      <button
        type="button"
        onClick={() => onChange('single')}
        className={`h-9 rounded-md px-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
          mode === 'single'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-background/70'
        }`}
      >
        Single
      </button>
      <button
        type="button"
        onClick={() => onChange('bulk')}
        className={`h-9 rounded-md px-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
          mode === 'bulk'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-background/70'
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
      aria-label="Names (one per line)"
      rows={5}
      required
      className="min-h-32 w-full resize-y rounded-lg border border-border bg-background px-3.5 py-3 text-sm leading-6 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15"
    />
  )
}
