import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/app/time-tracker/day')({
  beforeLoad: () => {
    throw redirect({
      to: '/app/time-tracker',
      search: { view: 'day' },
      replace: true,
    })
  },
})
