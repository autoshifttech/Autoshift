import { describe, expect, it } from 'vitest'
import { RANGES, buildInsights, change } from './model'

describe('insights', () => {
  it('builds one point per day and a narrowing funnel', () => {
    for (const r of RANGES) {
      const d = buildInsights(r)
      expect(d.days).toHaveLength(r)
      for (let i = 1; i < d.funnel.length; i++) expect(d.funnel[i].value).toBeLessThanOrEqual(d.funnel[i - 1].value)
      expect(d.heat).toHaveLength(7)
      expect(d.heat[0]).toHaveLength(24)
    }
  })

  it('is deterministic and computes change', () => {
    expect(buildInsights(30)).toEqual(buildInsights(30))
    expect(change(110, 100)).toBe(10)
    expect(change(5, 0)).toBeNull()
  })
})
