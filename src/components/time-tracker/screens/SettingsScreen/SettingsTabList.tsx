import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { Building2, Code2, ShieldCheck, Target, Workflow } from 'lucide-react'
import { cn } from '#/lib/utils'

export type SettingsTab =
  | 'general'
  | 'location'
  | 'integrations'
  | 'expectations'
  | 'developer'

const settingsTabs = [
  {
    id: 'general',
    label: 'General',
    description: 'Workspace identity',
    icon: Building2,
  },
  {
    id: 'location',
    label: 'Location & privacy',
    description: 'Collection and history',
    icon: ShieldCheck,
  },
  {
    id: 'integrations',
    label: 'Integrations',
    description: 'Google Sheets and sync',
    icon: Workflow,
  },
  {
    id: 'expectations',
    label: 'Working hours & payroll',
    description: 'Tracking expectations and pay periods',
    icon: Target,
    manageOnly: true,
  },
  {
    id: 'developer',
    label: 'Developer tools',
    description: 'API access and email tests',
    icon: Code2,
    manageOnly: true,
  },
] satisfies Array<{
  id: SettingsTab
  label: string
  description: string
  icon: typeof Building2
  manageOnly?: boolean
}>

export function normalizeSettingsTab(value: unknown): SettingsTab {
  return typeof value === 'string' &&
    settingsTabs.some((tab) => tab.id === value)
    ? (value as SettingsTab)
    : 'general'
}

export function SettingsTabList({
  activeTab,
  canManageSettings,
  idBase,
  onTabChange,
}: {
  activeTab: SettingsTab
  canManageSettings: boolean
  idBase: string
  onTabChange: (tab: SettingsTab) => void
}) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const visibleTabs = settingsTabs.filter(
    (tab) => !tab.manageOnly || canManageSettings,
  )
  const gridClass =
    visibleTabs.length >= 5
      ? 'sm:grid-cols-5'
      : visibleTabs.length === 4
        ? 'sm:grid-cols-4'
        : 'sm:grid-cols-3'

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let nextIndex: number | undefined

    if (event.key === 'ArrowRight') {
      nextIndex = (index + 1) % visibleTabs.length
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + visibleTabs.length) % visibleTabs.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = visibleTabs.length - 1
    }

    if (nextIndex === undefined) return
    event.preventDefault()
    onTabChange(visibleTabs[nextIndex].id)
    tabRefs.current[nextIndex]?.focus()
  }

  return (
    <div
      className={cn(
        'flex gap-2 overflow-x-auto rounded-xl border border-stone bg-muted/35 p-2 shadow-[var(--shadow-whisper)] sm:grid',
        gridClass,
      )}
      role="tablist"
      aria-label="Workspace settings sections"
    >
      {visibleTabs.map((tab, index) => {
        const Icon = tab.icon
        const selected = activeTab === tab.id

        return (
          <button
            key={tab.id}
            ref={(element) => {
              tabRefs.current[index] = element
            }}
            id={`${idBase}-${tab.id}-tab`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${idBase}-${tab.id}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            className={cn(
              'group flex min-w-40 shrink-0 items-center gap-3 rounded-lg border px-3 py-3 text-left outline-none transition-[color,background-color,border-color,box-shadow] motion-reduce:transition-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-w-0',
              selected
                ? 'border-stone bg-eggshell text-foreground shadow-[var(--shadow-whisper)]'
                : 'border-transparent text-smoke hover:bg-eggshell/60 hover:text-foreground',
            )}
          >
            <span
              className={cn(
                'grid size-9 shrink-0 place-items-center rounded-md transition-colors',
                selected
                  ? 'bg-primary-action text-primary-action-foreground'
                  : 'bg-eggshell text-smoke group-hover:text-foreground',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">
                {tab.label}
              </span>
              <span className="mt-0.5 hidden truncate text-xs text-smoke lg:block">
                {tab.description}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
