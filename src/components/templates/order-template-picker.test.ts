import { describe, expect, it } from 'vitest'
import { usable, varCount } from './order-template-picker'

const row = (over: Record<string, unknown> = {}) => ({ name: 't', language: 'en', status: 'APPROVED', category: 'Utility', body_text: 'Hi {{1}}, order #{{2}}: {{3}}.', header_type: null, header_content: null, buttons: null, ...over })

describe('order update templates', () => {
  it('counts the blanks in the body', () => {
    expect(varCount('Hi {{1}}, order #{{2}}: {{3}}.')).toBe(3)
    expect(varCount('Hi {{ 2 }} and {{1}}')).toBe(2)
    expect(varCount('No blanks')).toBe(0)
  })
  it('offers only templates AutoShift can fill', () => {
    expect(usable(row())).toBe(true)
    expect(usable(row({ header_type: 'text', header_content: 'Order update' }))).toBe(true)
    expect(usable(row({ header_type: 'image' }))).toBe(false)
    expect(usable(row({ header_type: 'text', header_content: 'Order {{1}}' }))).toBe(false)
    expect(usable(row({ buttons: [{ type: 'URL', url: 'https://x.com/{{1}}' }] }))).toBe(false)
    expect(usable(row({ buttons: [{ type: 'QUICK_REPLY' }] }))).toBe(true)
  })
})
