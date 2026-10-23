import { describe, expect, it } from 'vitest'
import { buildWaLink, parseInline, prefixLines, validateNationalNumber, wrapSelection } from './whatsapp'

describe('buildWaLink', () => {
  it('joins country code and number and encodes the message', () => {
    expect(buildWaLink('91', '098765 43210', 'Hi! I’d like a quote & price')).toBe(
      'https://wa.me/919876543210?text=Hi!%20I%E2%80%99d%20like%20a%20quote%20%26%20price',
    )
    expect(buildWaLink('1', '(555) 010-0199')).toBe('https://wa.me/15550100199')
  })
})

describe('validateNationalNumber', () => {
  it('rejects empty, too short and duplicated country codes', () => {
    expect(validateNationalNumber('91', '')).toMatch(/Enter/)
    expect(validateNationalNumber('91', '123')).toMatch(/short/)
    expect(validateNationalNumber('91', '919876543210')).toMatch(/country code/)
    expect(validateNationalNumber('91', '98765 43210')).toBeNull()
  })
})

describe('formatting helpers', () => {
  it('wraps the selection', () => {
    expect(wrapSelection('hello world', 6, 11, 'bold')).toEqual({ text: 'hello *world*', selectionStart: 7, selectionEnd: 12 })
  })

  it('prefixes selected lines', () => {
    expect(prefixLines('a\nb\nc', 0, 3, 'number').text).toBe('1. a\n2. b\nc')
  })

  it('parses nested inline styles', () => {
    expect(parseInline('hi *bold _both_* ~x~ ```code```')).toEqual([
      { text: 'hi ', styles: [] },
      { text: 'bold ', styles: ['bold'] },
      { text: 'both', styles: ['bold', 'italic'] },
      { text: ' ', styles: [] },
      { text: 'x', styles: ['strike'] },
      { text: ' ', styles: [] },
      { text: 'code', styles: ['mono'] },
    ])
  })
})
