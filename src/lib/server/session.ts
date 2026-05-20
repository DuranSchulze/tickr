import { createServerFn } from '@tanstack/react-start'

export const getSessionFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { getSession } = await import('./session.server')
    return getSession()
  },
)
