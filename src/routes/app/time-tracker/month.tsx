import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/app/time-tracker/month')({
  beforeLoad: () => {
    throw redirect({
      to: '/app/time-tracker',
      search: { view: 'month' },
      replace: true,
    })
  },
})
