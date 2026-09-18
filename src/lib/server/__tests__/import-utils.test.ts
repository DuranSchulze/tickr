import { describe, expect, it } from 'vitest'
import { chunkArray } from '../shared/import-utils.server'

describe('chunkArray', () => {
  it('returns a single chunk when everything fits', () => {
    expect(chunkArray([1, 2, 3])).toEqual([[1, 2, 3]])
  })

  it('returns no chunks for an empty input', () => {
    expect(chunkArray([])).toEqual([])
  })

  it('splits at the given size, preserving order and every item', () => {
    const items = Array.from({ length: 10 }, (_, i) => i)
    const chunks = chunkArray(items, 4)

    expect(chunks.map((chunk) => chunk.length)).toEqual([4, 4, 2])
    expect(chunks.flat()).toEqual(items)
  })

  it('keeps every chunk below the 65,535 bind-parameter ceiling by default', () => {
    const items = Array.from({ length: 2_500 }, (_, i) => i)
    const chunks = chunkArray(items)

    expect(chunks).toHaveLength(3)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(1_000)
    }
    expect(chunks.flat()).toEqual(items)
  })
})
