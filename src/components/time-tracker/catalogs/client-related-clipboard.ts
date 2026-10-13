export type ClientRelatedKind = 'projects' | 'tasks' | 'tags'

export type ClientRelatedClipboardItem = {
  name: string
  projectName?: string | null
  archived: boolean
}

const KIND_LABEL: Record<ClientRelatedKind, string> = {
  projects: 'Projects',
  tags: 'Tags',
  tasks: 'Tasks',
}

/**
 * Serializes a client's related items into a layered, paste-friendly outline:
 * the client name forms the top layer and each item is indented beneath it, one
 * per line, so pasting into a doc or message keeps the hierarchy intact.
 *
 * Example (projects):
 *
 *   Acme
 *     - Website redesign
 *     - Mobile app (Archived)
 */
export function formatClientRelatedList({
  clientName,
  kind,
  items,
}: {
  clientName: string
  kind: ClientRelatedKind
  items: ClientRelatedClipboardItem[]
}): string {
  const header = `${clientName} — ${KIND_LABEL[kind]}`
  if (items.length === 0) return `${header}\n  (none)`
  const lines = items.map(
    (item) =>
      `  - ${item.name}${item.projectName ? ` — ${item.projectName}` : ''}${item.archived ? ' (Archived)' : ''}`,
  )
  return [header, ...lines].join('\n')
}

/** Copies text, falling back to a hidden textarea for stricter browser contexts. */
export async function writeClipboardText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    // Fall through to the textarea fallback.
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!copied) throw new Error('Copy command failed')
}
