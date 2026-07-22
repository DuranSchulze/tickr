import { describe, expect, it } from 'vitest'
import {
  catalogDialogBodyClass,
  catalogDialogContentClass,
} from './CatalogFormDialog'
import { catalogFormClass, inputClass } from './CatalogFormParts'

describe('catalog dialog layout contract', () => {
  it('uses a full-width bottom sheet on mobile and a bounded desktop dialog', () => {
    expect(catalogDialogContentClass).toContain('bottom-0')
    expect(catalogDialogContentClass).toContain('w-full')
    expect(catalogDialogContentClass).toContain('max-h-[calc(100dvh-0.75rem)]')
    expect(catalogDialogContentClass).toContain('sm:max-w-[30rem]')
    expect(catalogDialogContentClass).toContain('sm:top-1/2')
    expect(catalogDialogBodyClass).toContain('overflow-y-auto')
    expect(catalogDialogBodyClass).toContain('env(safe-area-inset-bottom)')
  })

  it('keeps every catalog form on the same spacing and control-height scale', () => {
    expect(catalogFormClass).toContain('gap-4')
    expect(inputClass).toContain('h-11')
    expect(inputClass).toContain('w-full')
  })
})
