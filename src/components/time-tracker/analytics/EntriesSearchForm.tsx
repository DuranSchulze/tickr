import { Search, X } from 'lucide-react'

export function EntriesSearchForm({
  searchQuery,
  onSearchSubmit,
  onSearchClear,
}: {
  searchQuery: string
  onSearchSubmit: (query: string) => void
  onSearchClear: () => void
}) {
  return (
    <form
      className="flex min-w-0 flex-1 items-center gap-2 md:flex-none"
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        onSearchSubmit(String(data.get('entrySearch') ?? ''))
      }}
    >
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          name="entrySearch"
          defaultValue={searchQuery}
          placeholder="Search entries…"
          aria-label="Search time entries"
          className="peer h-8 w-full rounded-md border border-border bg-background pl-8 pr-8 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 md:w-52"
        />
        <button
          type="button"
          onClick={(event) => {
            const input =
              event.currentTarget.form?.elements.namedItem('entrySearch')
            if (input instanceof HTMLInputElement) {
              input.value = ''
              input.focus()
            }
            onSearchClear()
          }}
          aria-label="Clear entry search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 peer-placeholder-shown:invisible"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <button
        type="submit"
        className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
      >
        <Search className="size-3.5" />
        Search
      </button>
    </form>
  )
}
