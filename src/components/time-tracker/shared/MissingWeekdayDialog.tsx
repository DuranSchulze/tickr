import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  confirmMissingWeekdayFn,
  getMissingWeekdayFn,
} from '#/lib/server/missing-weekday'
import { trackerKeys } from '#/lib/time-tracker/query-keys'
import { useNetworkStatus } from '#/lib/time-tracker/useNetworkStatus'

const dateLabel = new Intl.DateTimeFormat('en', {
  dateStyle: 'full',
  timeZone: 'UTC',
})

export function MissingWeekdayDialog({
  workspaceId,
  userId,
}: {
  workspaceId: string
  userId: string
}) {
  const { isOnline } = useNetworkStatus()
  const queryClient = useQueryClient()
  const queryKey = trackerKeys.missingWeekday(workspaceId, userId)
  const [dismissed, setDismissed] = useState<string[]>([])
  const candidate = useQuery({
    queryKey,
    queryFn: () => getMissingWeekdayFn({ data: { workspaceId } }),
    enabled: isOnline && typeof window !== 'undefined',
    retry: false,
  })
  const confirmation = useMutation({
    mutationFn: (date: string) =>
      confirmMissingWeekdayFn({ data: { workspaceId, userId, date } }),
    onSuccess: async (result, date) => {
      queryClient.setQueryData(queryKey, null)
      await queryClient.invalidateQueries({ queryKey })
      if (result === 'confirmed') {
        setDismissed((previous) => [
          ...previous,
          `${workspaceId}:${userId}:${date}`,
        ])
        await queryClient.invalidateQueries({
          queryKey: trackerKeys.timesheets,
        })
      }
    },
  })
  const date = candidate.data?.date
  const dismissalKey = `${workspaceId}:${userId}:${date}`
  if (!isOnline || !date || dismissed.includes(dismissalKey)) return null
  const label = dateLabel.format(new Date(date))
  function dismiss() {
    if (confirmation.isPending) return
    confirmation.reset()
    setDismissed((previous) => [...previous, dismissalKey])
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) dismiss()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>No time entries on {label}</DialogTitle>
          <DialogDescription>
            If you have no time to add for this date, confirm N/A for 8 AM–5 PM
            ({candidate.data?.timezone}). Your tracked hours stay at zero.
          </DialogDescription>
        </DialogHeader>
        {confirmation.isError && (
          <p role="alert">
            Could not save your confirmation. Please try again.
          </p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={confirmation.isPending}
            onClick={dismiss}
          >
            Later
          </Button>
          <Button
            disabled={confirmation.isPending}
            onClick={() => confirmation.mutate(date)}
          >
            {confirmation.isPending ? 'Saving…' : 'Confirm N/A'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
