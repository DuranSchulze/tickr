import { useState } from 'react'
import { MessageSquare, X } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'

const FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSdnCzuAoazqcsgm3U0irOKBljQdGdo636tjGj5efZhz4RsNPw/viewform?embedded=true'

/**
 * Floating feedback button + slide-in panel.
 * Accessible anywhere on the dashboard — desktop & mobile.
 */
export function FeedbackFloatingPanel() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Floating toggle button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close feedback' : 'Give feedback'}
        title={open ? 'Close feedback' : 'Give feedback'}
        className={`fixed bottom-6 right-6 z-40 flex size-12 items-center justify-center rounded-full shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 ${
          open
            ? 'bg-muted text-muted-foreground shadow-none ring-1 ring-border'
            : 'bg-primary text-primary-foreground shadow-primary/25'
        }`}
      >
        {open ? <X className="size-5" /> : <MessageSquare className="size-5" />}
      </button>

      {/* Sliding panel from the right */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />

            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card shadow-2xl"
            >
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <MessageSquare className="size-5 text-primary" />
                  Feedback
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Close feedback form"
                >
                  <X className="size-5" />
                </button>
              </div>

              {/* Google Form iframe */}
              <div className="flex-1">
                <iframe
                  src={FORM_URL}
                  title="Feedback Form"
                  className="h-full w-full border-0"
                >
                  Loading…
                </iframe>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
