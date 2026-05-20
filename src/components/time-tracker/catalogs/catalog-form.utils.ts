import { gooeyToast } from 'goey-toast'
import type { useRouter } from '@tanstack/react-router'

export function parseBulkNames(raw: string): string[] {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

export async function runBulk<T>(
  names: string[],
  createOne: (name: string) => Promise<T>,
  label: string,
  router: ReturnType<typeof useRouter>,
  onSuccess?: () => void,
) {
  const results = await Promise.allSettled(names.map(createOne))
  await router.invalidate()
  const succeeded = results.filter((r) => r.status === 'fulfilled').length
  const failed = results.filter((r) => r.status === 'rejected').length
  if (succeeded > 0) {
    gooeyToast.success(
      `${succeeded} ${label}${succeeded > 1 ? 's' : ''} created${failed > 0 ? `, ${failed} failed` : ''}`,
    )
    onSuccess?.()
  } else {
    gooeyToast.error(`Failed to create ${label}s`)
  }
}
