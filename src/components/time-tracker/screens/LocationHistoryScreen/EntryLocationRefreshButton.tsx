import { LocateFixed } from 'lucide-react'

export function EntryLocationRefreshButton({
  entryName,
  refreshing,
  onRefresh,
}: {
  entryName: string
  refreshing: boolean
  onRefresh: () => void
}) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={refreshing}
      className="absolute right-3 top-3 inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-[10px] font-bold text-foreground shadow-sm transition-colors hover:bg-muted disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Refresh location for ${entryName}`}
    >
      <LocateFixed
        className={`size-3 ${refreshing ? 'animate-pulse' : ''}`}
        aria-hidden="true"
      />
      {refreshing ? 'Locating' : 'Refresh location'}
    </button>
  )
}
