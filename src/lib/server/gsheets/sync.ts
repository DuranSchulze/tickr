import { createServerFn } from '@tanstack/react-start'

export const syncWorkspaceToGoogleSheetsFn = createServerFn({
  method: 'POST',
}).handler(async () => {
  const { syncWorkspaceToGoogleSheets } = await import('./sync.server')
  return syncWorkspaceToGoogleSheets()
})

export const importCatalogsFromSheetFn = createServerFn({
  method: 'POST',
}).handler(async () => {
  const { importCatalogsFromSheet } = await import('./catalog-sync.server')
  return importCatalogsFromSheet()
})

export const importClientsFromSheetFn = createServerFn({
  method: 'POST',
}).handler(async () => {
  const { importClientsFromSheet } = await import('./catalog-sync.server')
  return importClientsFromSheet()
})

export const importProjectsFromSheetFn = createServerFn({
  method: 'POST',
}).handler(async () => {
  const { importProjectsFromSheet } = await import('./catalog-sync.server')
  return importProjectsFromSheet()
})

export const importTagsFromSheetFn = createServerFn({
  method: 'POST',
}).handler(async () => {
  const { importTagsFromSheet } = await import('./catalog-sync.server')
  return importTagsFromSheet()
})

export const importDepartmentsFromSheetFn = createServerFn({
  method: 'POST',
}).handler(async () => {
  const { importDepartmentsFromSheet } = await import('./catalog-sync.server')
  return importDepartmentsFromSheet()
})

export const ensureCatalogTabsFn = createServerFn({
  method: 'POST',
}).handler(async () => {
  const { ensureCatalogTabsForWorkspace } =
    await import('./catalog-sync.server')
  return ensureCatalogTabsForWorkspace()
})

export const syncCatalogsWithSheetFn = createServerFn({
  method: 'POST',
}).handler(async () => {
  const { syncCatalogsWithSheet } = await import('./catalog-sync.server')
  return syncCatalogsWithSheet()
})
