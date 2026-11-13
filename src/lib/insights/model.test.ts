import { describe, expect, it } from 'vitest'
import { change } from './model'
import { emptyInsights } from './live'

describe('insights', () => {
  it('starts each period at zero, one point per day', () => {
    for (const r of [7, 30, 90] as const) {
      const d = emptyInsights(r)
      expect(d.days).toHaveLength(r)
      expect(d.totals.conversations).toBe(0)
      expect(d.heat).toHaveLength(7)
      expect(d.heat[0]).toHaveLength(24)
    }
  })

  it('computes change', () => {
    expect(change(110, 100)).toBe(10)
    expect(change(5, 0)).toBeNull()
  })
})
