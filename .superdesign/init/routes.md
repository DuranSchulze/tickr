# Routes

File-based routing (TanStack Router, `src/routes/`, generated tree `src/routeTree.gen.ts`). `/app/*` routes render inside `src/routes/app.tsx` → `AppShell`. Public pages (`/`, `/auth`, `/pricing`, `/daily-report`, `/weekly-department-report/$reportId`) render without the shell.

| URL                                                | File                                                            | Layout                   |
| -------------------------------------------------- | --------------------------------------------------------------- | ------------------------ |
| `(layout/root)`                                    | `src/routes/__root.tsx`                                         | public                   |
| `(layout/root)`                                    | `src/routes/app/workspace/catalogs-route.ts`                    | public                   |
| `/`                                                | `src/routes/index.tsx`                                          | public                   |
| `/api/auth/$`                                      | `src/routes/api/auth/$.ts`                                      | API                      |
| `/api/cron/daily-reports`                          | `src/routes/api/cron/daily-reports.ts`                          | API                      |
| `/api/cron/timer-reminders`                        | `src/routes/api/cron/timer-reminders.ts`                        | API                      |
| `/api/cron/weekly-reports`                         | `src/routes/api/cron/weekly-reports.ts`                         | API                      |
| `/api/docs`                                        | `src/routes/api/docs.ts`                                        | API                      |
| `/api/health`                                      | `src/routes/api/health.ts`                                      | API                      |
| `/api/newsletter/subscribe`                        | `src/routes/api/newsletter/subscribe.ts`                        | API                      |
| `/api/openapi.json`                                | `src/routes/api/openapi[.]json.ts`                              | API                      |
| `/api/reports/daily/$format`                       | `src/routes/api/reports/daily.$format.ts`                       | API                      |
| `/api/reports/weekly-department/$reportId/$format` | `src/routes/api/reports/weekly-department.$reportId.$format.ts` | API                      |
| `/api/v1/auth/developer-sign-in`                   | `src/routes/api/v1/auth/developer-sign-in.ts`                   | API                      |
| `/api/v1/auth/login`                               | `src/routes/api/v1/auth/login.ts`                               | API                      |
| `/api/v1/auth/register`                            | `src/routes/api/v1/auth/register.ts`                            | API                      |
| `/api/v1/auth/sign-in`                             | `src/routes/api/v1/auth/sign-in.ts`                             | API                      |
| `/api/v1/clients`                                  | `src/routes/api/v1/clients.ts`                                  | API                      |
| `/api/v1/departments`                              | `src/routes/api/v1/departments.ts`                              | API                      |
| `/api/v1/dtr-integration`                          | `src/routes/api/v1/dtr-integration.ts`                          | API                      |
| `/api/v1/member-day-activity`                      | `src/routes/api/v1/member-day-activity.ts`                      | API                      |
| `/api/v1/members`                                  | `src/routes/api/v1/members.ts`                                  | API                      |
| `/api/v1/projects`                                 | `src/routes/api/v1/projects.ts`                                 | API                      |
| `/api/v1/tags`                                     | `src/routes/api/v1/tags.ts`                                     | API                      |
| `/api/v1/tasks`                                    | `src/routes/api/v1/tasks.ts`                                    | API                      |
| `/api/v1/time-entries`                             | `src/routes/api/v1/time-entries.ts`                             | API                      |
| `/api/v1/workspace`                                | `src/routes/api/v1/workspace.ts`                                | API                      |
| `/api/webhooks/xendit`                             | `src/routes/api/webhooks/xendit.ts`                             | API                      |
| `/app`                                             | `src/routes/app.tsx`                                            | authenticated (AppShell) |
| `/app/analytics`                                   | `src/routes/app/analytics.tsx`                                  | authenticated (AppShell) |
| `/app/analytics_/overview`                         | `src/routes/app/analytics_.overview.tsx`                        | authenticated (AppShell) |
| `/app/audit-logs`                                  | `src/routes/app/audit-logs.tsx`                                 | authenticated (AppShell) |
| `/app/calendar`                                    | `src/routes/app/calendar.tsx`                                   | authenticated (AppShell) |
| `/app/changelog`                                   | `src/routes/app/changelog.tsx`                                  | authenticated (AppShell) |
| `/app/department-analytics`                        | `src/routes/app/department-analytics.tsx`                       | authenticated (AppShell) |
| `/app/department-member-analytics/$memberId`       | `src/routes/app/department-member-analytics.$memberId.tsx`      | authenticated (AppShell) |
| `/app/department-member-calendar/$memberId`        | `src/routes/app/department-member-calendar.$memberId.tsx`       | authenticated (AppShell) |
| `/app/my-performance`                              | `src/routes/app/my-performance.tsx`                             | authenticated (AppShell) |
| `/app/my-workspaces`                               | `src/routes/app/my-workspaces.tsx`                              | authenticated (AppShell) |
| `/app/profile`                                     | `src/routes/app/profile.tsx`                                    | authenticated (AppShell) |
| `/app/reports`                                     | `src/routes/app/reports.tsx`                                    | authenticated (AppShell) |
| `/app/time-tracker/`                               | `src/routes/app/time-tracker/index.tsx`                         | authenticated (AppShell) |
| `/app/time-tracker/day`                            | `src/routes/app/time-tracker/day.tsx`                           | authenticated (AppShell) |
| `/app/time-tracker/month`                          | `src/routes/app/time-tracker/month.tsx`                         | authenticated (AppShell) |
| `/app/time-tracker/week`                           | `src/routes/app/time-tracker/week.tsx`                          | authenticated (AppShell) |
| `/app/timesheet`                                   | `src/routes/app/timesheet.tsx`                                  | authenticated (AppShell) |
| `/app/workspace/activity`                          | `src/routes/app/workspace/activity.tsx`                         | authenticated (AppShell) |
| `/app/workspace/activity_/map`                     | `src/routes/app/workspace/activity_.map.tsx`                    | authenticated (AppShell) |
| `/app/workspace/billing`                           | `src/routes/app/workspace/billing.tsx`                          | authenticated (AppShell) |
| `/app/workspace/catalogs`                          | `src/routes/app/workspace/catalogs.tsx`                         | authenticated (AppShell) |
| `/app/workspace/catalogs/clients`                  | `src/routes/app/workspace/catalogs.clients.tsx`                 | authenticated (AppShell) |
| `/app/workspace/catalogs/clients/$clientId`        | `src/routes/app/workspace/catalogs.clients.$clientId.tsx`       | authenticated (AppShell) |
| `/app/workspace/catalogs/cohorts`                  | `src/routes/app/workspace/catalogs.cohorts.tsx`                 | authenticated (AppShell) |
| `/app/workspace/catalogs/departments`              | `src/routes/app/workspace/catalogs.departments.tsx`             | authenticated (AppShell) |
| `/app/workspace/catalogs/projects`                 | `src/routes/app/workspace/catalogs.projects.tsx`                | authenticated (AppShell) |
| `/app/workspace/catalogs/roles`                    | `src/routes/app/workspace/catalogs.roles.tsx`                   | authenticated (AppShell) |
| `/app/workspace/catalogs/tags`                     | `src/routes/app/workspace/catalogs.tags.tsx`                    | authenticated (AppShell) |
| `/app/workspace/catalogs_/projects_/$projectId`    | `src/routes/app/workspace/catalogs_.projects_.$projectId.tsx`   | authenticated (AppShell) |
| `/app/workspace/locations`                         | `src/routes/app/workspace/locations.tsx`                        | authenticated (AppShell) |
| `/app/workspace/members`                           | `src/routes/app/workspace/members.tsx`                          | authenticated (AppShell) |
| `/app/workspace/members/$memberId`                 | `src/routes/app/workspace/members.$memberId.tsx`                | authenticated (AppShell) |
| `/app/workspace/settings`                          | `src/routes/app/workspace/settings.tsx`                         | authenticated (AppShell) |
| `/auth/`                                           | `src/routes/auth/index.tsx`                                     | public                   |
| `/auth/forgot-password`                            | `src/routes/auth/forgot-password.tsx`                           | public                   |
| `/auth/reset-password`                             | `src/routes/auth/reset-password.tsx`                            | public                   |
| `/daily-report`                                    | `src/routes/daily-report.tsx`                                   | public                   |
| `/invite/$token`                                   | `src/routes/invite.$token.tsx`                                  | public                   |
| `/lounge`                                          | `src/routes/lounge.tsx`                                         | public                   |
| `/onboarding`                                      | `src/routes/onboarding.tsx`                                     | public                   |
| `/performance/$token`                              | `src/routes/performance.$token.tsx`                             | public                   |
| `/pricing`                                         | `src/routes/pricing.tsx`                                        | public                   |
| `/weekly-department-report/$reportId`              | `src/routes/weekly-department-report.$reportId.tsx`             | public                   |

## Key post-login pages

- `/app/time-tracker` (+ `/day`, `/week`, `/month`): dashboard — timer panel, manual entry, entries list/groups, filters, report emails button.
- `/app/timesheet`: weekly timesheet grid per member/department, exports.
- `/app/analytics`, `/app/analytics/overview`, `/app/department-analytics`: charts, heatmap, member breakdowns.
- `/app/reports`: bulk reports and exports.
- `/app/calendar`: calendar view of entries.
- `/app/workspace/members`, `/members/$memberId`: member table, invites, roles, rates.
- `/app/workspace/catalogs/*`: clients, projects, tags, departments, cohorts, roles tables.
- `/app/workspace/settings`, `/billing`, `/activity`, `/locations`, `/app/audit-logs`: workspace admin.
- `/app/profile`, `/app/my-performance`, `/app/my-workspaces`, `/app/changelog`.
