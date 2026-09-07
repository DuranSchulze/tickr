type MemberWithActiveEntry = {
  activeEntry: unknown | null
}

export function hasRunningTimer(member: MemberWithActiveEntry): boolean {
  return member.activeEntry !== null
}

export function getTimerStatusLabel(member: MemberWithActiveEntry): string {
  return hasRunningTimer(member) ? 'Timer running' : 'No timer running'
}

export function countRunningTimers(members: MemberWithActiveEntry[]): number {
  return members.filter(hasRunningTimer).length
}
