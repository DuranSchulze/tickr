import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'

export const catalogDialogContentClass =
  'bottom-0 left-0 top-auto max-h-[calc(100dvh-0.75rem)] w-full max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-b-none rounded-t-2xl p-0 sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[min(90dvh,42rem)] sm:max-w-[30rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl'

export const catalogDialogBodyClass =
  'min-h-0 overflow-y-auto overscroll-contain px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-6'

export function CatalogFormDialog({
  title,
  open,
  onClose,
  children,
}: {
  title: string
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent
        showCloseButton={false}
        className={catalogDialogContentClass}
      >
        <DialogHeader className="shrink-0 flex-row items-center justify-between gap-4 border-b border-border px-4 py-3.5 text-left sm:px-6 sm:py-4">
          <div className="min-w-0">
            <DialogTitle className="truncate text-base font-bold text-foreground sm:text-lg">
              {title}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Catalog form for {title}.
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <button
              type="button"
              className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-label={`Close ${title}`}
            >
              <X className="size-4" />
            </button>
          </DialogClose>
        </DialogHeader>

        <div className={catalogDialogBodyClass}>{children}</div>
      </DialogContent>
    </Dialog>
  )
}
