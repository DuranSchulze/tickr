const FULLSCREEN_WORKSPACE_ROUTES = new Set(['/app/workspace/activity/map'])

export function usesFullscreenWorkspaceLayout(pathname: string): boolean {
  return FULLSCREEN_WORKSPACE_ROUTES.has(pathname)
}

export function getAppShellLayout(pathname: string, isEmbed: boolean) {
  const usesFullscreenLayout = usesFullscreenWorkspaceLayout(pathname)

  return {
    usesFullscreenLayout,
    showAppChrome: !isEmbed && !usesFullscreenLayout,
    mainClassName: usesFullscreenLayout
      ? 'min-w-0 flex-1 overflow-hidden p-0'
      : `min-w-0 flex-1 overflow-y-auto overflow-x-hidden ${
          isEmbed ? 'p-2' : 'p-4 sm:p-6'
        }`,
  }
}

export function getAppShellNavigationState(pathname: string) {
  const timerActive = pathname.startsWith('/app/time-tracker')
  const analyticsActive = pathname.startsWith('/app/analytics')
  const reportsActive = pathname.startsWith('/app/reports')
  const timesheetActive = pathname.startsWith('/app/timesheet')
  const performanceActive = pathname.startsWith('/app/my-performance')
  const departmentAnalyticsActive =
    pathname.startsWith('/app/department-analytics') ||
    pathname.startsWith('/app/department-member-analytics')
  const activityActive = pathname.startsWith('/app/workspace/activity')
  const locationsActive = pathname.startsWith('/app/workspace/locations')
  const calendarActive =
    pathname.startsWith('/app/calendar') ||
    pathname.startsWith('/app/department-member-calendar')
  const settingsActive =
    (pathname.startsWith('/app/workspace') &&
      !activityActive &&
      !locationsActive) ||
    pathname.startsWith('/app/audit-logs')

  return {
    timerActive,
    analyticsGroupActive:
      analyticsActive ||
      reportsActive ||
      timesheetActive ||
      performanceActive ||
      departmentAnalyticsActive ||
      activityActive ||
      locationsActive,
    calendarActive,
    settingsActive,
    billingActive: pathname.startsWith('/app/workspace/billing'),
  }
}
