import { DollarSign } from 'lucide-react'

export function BillableToggleButton({
  pressed,
  onPressedChange,
  className = '',
}: {
  pressed: boolean
  onPressedChange: (pressed: boolean) => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={() => onPressedChange(!pressed)}
      aria-pressed={pressed}
      aria-label={
        pressed ? 'Mark timer as non-billable' : 'Mark timer as billable'
      }
      title={pressed ? 'Billable' : 'Non-billable'}
      className={`inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:pointer-events-none disabled:opacity-50 ${className} ${
        pressed
          ? 'bg-primary/10 text-primary hover:bg-primary/15'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      <DollarSign className="h-4 w-4" />
    </button>
  )
}
