import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/app/time-tracker/week')({
  beforeLoad: () => {
    throw redirect({
      to: '/app/time-tracker',
      search: { view: 'week' },
      replace: true,
    })
  },
})
