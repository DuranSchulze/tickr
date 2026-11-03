import { beforeEach, describe, expect, it, vi } from 'vitest'

const sileo = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}))

vi.mock('sileo', () => ({ sileo }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})

describe('Sileo toast adapter', () => {
  it('delivers calls made while the library is loading with titles and descriptions', async () => {
    const { toast } = await import('./toast')
    toast.success('Saved', { description: 'Your changes are ready' })
    toast.error('Save failed', { description: 'Try again' })
    toast.warning('Check your input')

    await vi.waitFor(() => {
      expect(sileo.success).toHaveBeenCalledExactlyOnceWith({
        title: 'Saved',
        description: 'Your changes are ready',
      })
      expect(sileo.error).toHaveBeenCalledExactlyOnceWith({
        title: 'Save failed',
        description: 'Try again',
      })
      expect(sileo.warning).toHaveBeenCalledExactlyOnceWith({
        title: 'Check your input',
      })
    })

    toast.success('Saved again', { icon: '★', duration: 4500 })
    expect(sileo.success).toHaveBeenLastCalledWith({
      title: 'Saved again',
      icon: '★',
      duration: 4500,
    })
    expect(sileo.success).toHaveBeenCalledTimes(2)
  })
})
