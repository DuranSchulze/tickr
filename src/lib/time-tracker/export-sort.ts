export const exportSortByValues = ['date', 'client', 'tag', 'billable'] as const

export const exportSortOrderValues = ['asc', 'desc'] as const

export type ExportSortBy = (typeof exportSortByValues)[number]
export type ExportSortOrder = (typeof exportSortOrderValues)[number]
