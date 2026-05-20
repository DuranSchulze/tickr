// Google Sheets tab names cannot contain: : \ / ? * [ ]
// and must be 1-100 chars, non-empty.
export function sanitizeTabName(name: string): string {
  const cleaned = name
    .replace(/[:\\/?*[\]]/g, ' ')
    .trim()
    .slice(0, 100)
  return cleaned || 'Untitled'
}
