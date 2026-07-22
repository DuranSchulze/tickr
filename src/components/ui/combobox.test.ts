import { describe, expect, it } from 'vitest'
import { filterComboboxOptions } from './combobox'

describe('filterComboboxOptions', () => {
  const clients = [
    { value: '', label: 'All clients' },
    { value: 'client-acme', label: 'Acme' },
    { value: 'client-globex', label: 'Globex', description: 'Suspended' },
  ]

  it('narrows catalog options by typed label text', () => {
    expect(filterComboboxOptions(clients, 'acme', 80)).toEqual({
      filteredOptions: [{ value: 'client-acme', label: 'Acme' }],
      truncated: false,
    })
  })

  it('matches descriptions and reports truncated results', () => {
    expect(filterComboboxOptions(clients, 'suspended', 0)).toEqual({
      filteredOptions: [],
      truncated: true,
    })
  })
})
