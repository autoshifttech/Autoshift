import { describe, expect, it } from 'vitest'
import { formatSize, kindOf } from './model'

describe('files', () => {
  it('detects kinds from type or extension', () => {
    expect(kindOf({ name: 'a.JPG' })).toBe('image')
    expect(kindOf({ name: 'x', type: 'application/pdf' })).toBe('pdf')
    expect(kindOf({ name: 'clip.mp4' })).toBe('video')
    expect(kindOf({ name: 'sheet.xlsx' })).toBe('other')
  })

  it('formats sizes', () => {
    expect(formatSize(512)).toBe('512 B')
    expect(formatSize(1.5 * 1024 * 1024)).toBe('1.5 MB')
    expect(formatSize(1024 * 1024 * 1024)).toBe('1 GB')
  })
})
