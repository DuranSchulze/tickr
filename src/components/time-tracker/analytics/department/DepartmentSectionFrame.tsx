import { Maximize2 } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'

export function DepartmentSectionFrame({
  title,
  subtitle,
  children,
  bodyClassName = 'p-4',
}: {
  title: string
  subtitle?: string
  children: ReactNode
  bodyClassName?: string
}) {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <>
      <section className="rounded-lg border border-border bg-card shadow-sm">
        <div className="flex min-w-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="m-0 truncate text-base font-bold text-foreground">
              {title}
            </h2>
            {subtitle && (
              <p className="m-0 mt-0.5 truncate text-xs text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              title={`Maximize ${title}`}
              aria-label={`Maximize ${title}`}
              className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Maximize2 className="size-3.5" />
            </button>
          </div>
        </div>
        <div className={bodyClassName}>{children}</div>
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="grid h-[92vh] w-[96vw] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-none">
          <DialogHeader className="border-b border-border px-5 py-4 pr-14">
            <DialogTitle className="text-lg font-bold text-foreground">
              {title}
            </DialogTitle>
            {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
          </DialogHeader>
          <div className="min-h-0 overflow-auto p-5">{children}</div>
        </DialogContent>
      </Dialog>
    </>
  )
}
