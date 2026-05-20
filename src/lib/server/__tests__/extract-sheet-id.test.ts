import { describe, it, expect } from 'vitest'
import {
  extractSheetId,
  InvalidSheetUrlError,
} from '../gsheets/extract-sheet-id'

describe('extractSheetId', () => {
  it('extracts the id from a typical Google Sheets URL', () => {
    expect(
      extractSheetId(
        'https://docs.google.com/spreadsheets/d/1AbC_dEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0',
      ),
    ).toBe('1AbC_dEfGhIjKlMnOpQrStUvWxYz0123456789')
  })

  it('extracts the id when no trailing path is present', () => {
    expect(
      extractSheetId('https://docs.google.com/spreadsheets/d/abc-DEF_123/'),
    ).toBe('abc-DEF_123')
  })

  it('accepts a bare id', () => {
    expect(extractSheetId('1AbC_dEfGhIjKlMnOpQrStUvWxYz0123456789')).toBe(
      '1AbC_dEfGhIjKlMnOpQrStUvWxYz0123456789',
    )
  })

  it('trims whitespace', () => {
    expect(
      extractSheetId(
        '  https://docs.google.com/spreadsheets/d/abcdef1234567890XYZ/edit  ',
      ),
    ).toBe('abcdef1234567890XYZ')
  })

  it('rejects an empty string', () => {
    expect(() => extractSheetId('')).toThrow(InvalidSheetUrlError)
  })

  it('rejects a non-Sheets URL', () => {
    expect(() => extractSheetId('https://example.com/foo')).toThrow(
      InvalidSheetUrlError,
    )
  })

  it('rejects a too-short bare string', () => {
    expect(() => extractSheetId('abc')).toThrow(InvalidSheetUrlError)
  })
})
