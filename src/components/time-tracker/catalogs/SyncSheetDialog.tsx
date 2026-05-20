import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'

type ImportType = 'clients' | 'projects' | 'tags' | 'departments' | 'all'

type ItemRecord = {
  name: string
  action: 'created' | 'updated' | 'skipped'
  detail?: string
}

type PhaseState = {
  phase: ImportType
  total: number
  current: number
  items: ItemRecord[]
  done: boolean
  warnings: string[]
}

type CompleteResult = {
  clients: number
  projects: number
  tags: number
  departments: number
  warnings: string[]
}

const PHASE_LABELS: Partial<Record<ImportType, string>> = {
  clients: 'Clients',
  projects: 'Projects',
  tags: 'Tags',
  departments: 'Departments',
}

const PHASE_ORDER: ImportType[] = ['clients', 'projects', 'tags', 'departments']

export function SyncSheetDialog({
  open,
  onClose,
  type,
  onComplete,
}: {
  open: boolean
  onClose: () => void
  type: ImportType
  onComplete?: () => void
}) {
  const [activePhase, setActivePhase] = useState<ImportType | null>(null)
  const [phaseStates, setPhaseStates] = useState<
    Partial<Record<ImportType, PhaseState>>
  >({})
  const [result, setResult] = useState<CompleteResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const reset = useCallback(() => {
    setActivePhase(null)
    setPhaseStates({})
    setResult(null)
    setError(null)
  }, [])

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort()
      reset()
      return
    }

    const controller = new AbortController()
    abortRef.current = controller

    async function start() {
      try {
        const response = await fetch('/api/import/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type }),
          signal: controller.signal,
        })

        if (!response.ok) {
          const err = await response
            .json()
            .catch(() => ({ error: 'Request failed' }))
          setError(err.error ?? `HTTP ${response.status}`)
          return
        }

        const reader = response.body?.getReader()
        if (!reader) {
          setError('Stream not available')
          return
        }

        const decoder = new TextDecoder()
        let buffer = ''

        for (;;) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // Parse SSE events from buffer
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? '' // keep incomplete line

          let currentEvent = ''
          let currentData = ''

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim()
            } else if (line.startsWith('data: ')) {
              currentData = line.slice(6).trim()
            } else if (line === '') {
              // Empty line = event boundary — process
              if (currentEvent && currentData) {
                try {
                  const parsed = JSON.parse(currentData)
                  handleEvent(currentEvent, parsed)
                } catch {
                  // skip malformed events
                }
              }
              currentEvent = ''
              currentData = ''
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError(err instanceof Error ? err.message : 'Connection lost')
      }
    }

    function handleEvent(event: string, data: Record<string, unknown>) {
      switch (event) {
        case 'phase': {
          const phase = data.phase as ImportType
          const total = data.total as number
          setActivePhase(phase)
          setPhaseStates((prev) => ({
            ...prev,
            [phase]: {
              phase,
              total,
              current: 0,
              items: [],
              done: false,
              warnings: [],
            },
          }))
          break
        }
        case 'item': {
          const phase = data.phase as ImportType
          const item = data.item as ItemRecord
          const current = data.current as number
          const total = data.total as number
          setPhaseStates((prev) => {
            const state = prev[phase]
            if (!state) return prev
            return {
              ...prev,
              [phase]: {
                ...state,
                current,
                total,
                items: [...state.items, item],
              },
            }
          })
          break
        }
        case 'phase_complete': {
          const pPhase = data.phase as ImportType
          const warnings = (data.warnings as string[] | undefined) ?? []
          setPhaseStates((prev) => {
            const state = prev[pPhase]
            if (!state) return prev
            return {
              ...prev,
              [pPhase]: { ...state, done: true, warnings },
            }
          })
          break
        }
        case 'complete': {
          setResult(data as unknown as CompleteResult)
          onComplete?.()
          break
        }
        case 'error': {
          setError((data.message as string | undefined) ?? 'Import failed')
          break
        }
      }
    }

    start()

    return () => {
      controller.abort()
    }
  }, [open, type, onComplete, reset])

  // Determine which phases are relevant
  const phases = type === 'all' ? PHASE_ORDER : [type]

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>Sync from Google Sheet</DialogTitle>
        </DialogHeader>

        {error ? (
          <ErrorState error={error} onClose={onClose} />
        ) : result ? (
          <CompleteState result={result} onClose={onClose} />
        ) : (
          <ProgressState
            phases={phases}
            phaseStates={phaseStates}
            activePhase={activePhase}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ProgressState({
  phases,
  phaseStates,
  activePhase,
}: {
  phases: ImportType[]
  phaseStates: Partial<Record<ImportType, PhaseState>>
  activePhase: ImportType | null
}) {
  // Calculate overall progress
  let totalItems = 0
  let totalCurrent = 0
  let totalDone = 0

  for (const phase of phases) {
    const state = phaseStates[phase]
    if (state) {
      totalItems += state.total
      totalCurrent += state.current
      if (state.done) totalDone++
    }
  }

  const overallPercent =
    totalItems > 0 ? Math.round((totalCurrent / totalItems) * 100) : 0

  // Show items from the active or most recent phase
  const activeState = activePhase ? phaseStates[activePhase] : null
  const visibleItems = activeState?.items.slice(-50) ?? [] // show last 50 items max

  return (
    <div className="flex flex-col gap-5 overflow-hidden">
      {/* Overall progress bar */}
      <div>
        <div className="flex items-center justify-between text-sm mb-1.5">
          <span className="font-semibold text-foreground">
            Overall progress
          </span>
          <span className="text-muted-foreground tabular-nums">
            {overallPercent}%
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
            style={{ width: `${overallPercent}%` }}
          />
        </div>
      </div>

      {/* Phase steps */}
      <div className="grid gap-2">
        {phases.map((phase) => {
          const state = phaseStates[phase]
          const isActive = phase === activePhase
          const isDone = state?.done ?? false

          return (
            <PhaseRow
              key={phase}
              label={PHASE_LABELS[phase] ?? phase}
              state={state ?? null}
              isActive={isActive}
              isDone={isDone}
            />
          )
        })}
      </div>

      {/* Live items feed */}
      {activeState && activeState.items.length > 0 && (
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
          <div className="border-b border-border bg-muted/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            Importing{' '}
            {(activePhase
              ? PHASE_LABELS[activePhase]
              : undefined
            )?.toLowerCase() ?? 'items'}
            …
            <span className="ml-1 font-normal">
              ({activeState.current}/{activeState.total})
            </span>
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {visibleItems.map((item, i) => (
              <div
                key={`${item.name}-${i}`}
                className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-accent/50"
              >
                {item.action === 'created' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                ) : item.action === 'updated' ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-500" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                )}
                <span className="truncate font-medium text-foreground">
                  {item.name}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {item.action === 'created'
                    ? 'Created'
                    : item.action === 'updated'
                      ? 'Updated'
                      : 'Skipped'}
                </span>
                {item.detail && (
                  <span
                    className="shrink-0 truncate text-muted-foreground/70 max-w-50"
                    title={item.detail}
                  >
                    — {item.detail}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!activeState && (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Starting import…
        </div>
      )}
    </div>
  )
}

function PhaseRow({
  label,
  state,
  isActive,
  isDone,
}: {
  label: string
  state: PhaseState | null
  isActive: boolean
  isDone: boolean
}) {
  const percent =
    state && state.total > 0
      ? Math.round((state.current / state.total) * 100)
      : 0

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
        isActive
          ? 'border-primary/40 bg-primary/5'
          : isDone
            ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20'
            : 'border-border bg-card'
      }`}
    >
      {/* Status icon */}
      <div className="flex h-6 w-6 shrink-0 items-center justify-center">
        {isDone ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
        ) : isActive ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        ) : (
          <Circle className="h-4 w-4 text-muted-foreground/40" />
        )}
      </div>

      {/* Phase name */}
      <span
        className={`text-sm font-semibold ${
          isActive
            ? 'text-primary'
            : isDone
              ? 'text-emerald-700 dark:text-emerald-300'
              : 'text-muted-foreground'
        }`}
      >
        {label}
      </span>

      {/* Progress bar (active phase only) */}
      {isActive && state && state.total > 0 && (
        <div className="flex flex-1 items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {state.current}/{state.total}
          </span>
        </div>
      )}

      {/* Count for completed phase */}
      {isDone && state && (
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {state.total} record{state.total !== 1 ? 's' : ''}
          {state.warnings.length > 0 && (
            <span className="ml-1 text-amber-500">
              ({state.warnings.length} warning
              {state.warnings.length !== 1 ? 's' : ''})
            </span>
          )}
        </span>
      )}
    </div>
  )
}

function CompleteState({
  result,
  onClose,
}: {
  result: CompleteResult
  onClose: () => void
}) {
  const hasWarnings = result.warnings.length > 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/20">
        <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
        <div>
          <p className="font-semibold text-emerald-800 dark:text-emerald-200">
            Import complete
          </p>
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            {result.clients > 0 &&
              `${result.clients} client${result.clients !== 1 ? 's' : ''} `}
            {result.projects > 0 &&
              `${result.projects} project${result.projects !== 1 ? 's' : ''} `}
            {result.tags > 0 &&
              `${result.tags} tag${result.tags !== 1 ? 's' : ''} `}
            {result.departments > 0 &&
              `${result.departments} department${result.departments !== 1 ? 's' : ''} `}
            synced
            {!result.clients &&
            !result.projects &&
            !result.tags &&
            !result.departments
              ? ' — no new records found'
              : ''}
            .
          </p>
        </div>
      </div>

      {hasWarnings && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
          <p className="mb-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
            {result.warnings.length} warning
            {result.warnings.length !== 1 ? 's' : ''}
          </p>
          <ul className="list-inside list-disc space-y-0.5 text-xs text-amber-600 dark:text-amber-400">
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={onClose}
        className="mt-2 inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:brightness-110"
      >
        Done
      </button>
    </div>
  )
}

function ErrorState({
  error,
  onClose,
}: {
  error: string
  onClose: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/20">
        <XCircle className="h-6 w-6 shrink-0 text-red-500" />
        <div>
          <p className="font-semibold text-red-800 dark:text-red-200">
            Import failed
          </p>
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="mt-2 inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:brightness-110"
      >
        Close
      </button>
    </div>
  )
}
