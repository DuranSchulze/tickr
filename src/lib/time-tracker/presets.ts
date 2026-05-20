import { z } from 'zod'

export const TimerPresetSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(50),
  clientId: z.string(),
  projectId: z.string(),
  tagIds: z.array(z.string()),
  billable: z.boolean(),
})

export type TimerPreset = z.infer<typeof TimerPresetSchema>

const MAX_PRESETS = 10
const STORAGE_KEY = (workspaceId: string) => `timer-presets:${workspaceId}`

export function getPresets(workspaceId: string): TimerPreset[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY(workspaceId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    const result = z.array(TimerPresetSchema).safeParse(parsed)
    return result.success ? result.data : []
  } catch {
    return []
  }
}

export function savePreset(
  workspaceId: string,
  preset: Omit<TimerPreset, 'id'>,
): { success: boolean; error?: string } {
  if (typeof window === 'undefined') {
    return { success: false, error: 'Cannot save preset on server' }
  }

  const presets = getPresets(workspaceId)

  if (presets.length >= MAX_PRESETS) {
    return { success: false, error: `Maximum ${MAX_PRESETS} presets reached` }
  }

  const nameExists = presets.some(
    (p) => p.name.toLowerCase() === preset.name.toLowerCase(),
  )
  if (nameExists) {
    return { success: false, error: 'Preset name already exists' }
  }

  const newPreset: TimerPreset = {
    ...preset,
    id: generateId(),
  }

  const updated = [...presets, newPreset]
  localStorage.setItem(STORAGE_KEY(workspaceId), JSON.stringify(updated))
  return { success: true }
}

export function deletePreset(workspaceId: string, presetId: string): void {
  if (typeof window === 'undefined') return
  const presets = getPresets(workspaceId)
  const updated = presets.filter((p) => p.id !== presetId)
  localStorage.setItem(STORAGE_KEY(workspaceId), JSON.stringify(updated))
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15)
}
