import { describe, expect, it } from 'vitest'
import { members, ruleMatches, type Customer, type SegmentRule } from './model'

const c: Customer = { id: 'c', name: 'A', phone: '+91', city: 'Chennai', tags: ['VIP'], temp: 'hot', lastMessageDays: 70, optedIn: true, source: 'website', joinedDays: 10 }
const r = (p: Partial<SegmentRule>): SegmentRule => ({ id: 'r', field: 'tag', op: 'is', value: 'VIP', ...p })

describe('segments', () => {
  it('matches each field and operator', () => {
    expect(ruleMatches(c, r({}))).toBe(true)
    expect(ruleMatches(c, r({ op: 'is_not' }))).toBe(false)
    expect(ruleMatches(c, r({ field: 'temp', value: 'warm' }))).toBe(false)
    expect(ruleMatches(c, r({ field: 'last_message', op: 'older_than', value: '60' }))).toBe(true)
    expect(ruleMatches(c, r({ field: 'last_message', op: 'within', value: '60' }))).toBe(false)
    expect(ruleMatches(c, r({ field: 'opted_in', value: 'no' }))).toBe(false)
    expect(ruleMatches(c, r({ field: 'joined', op: 'within', value: '30' }))).toBe(true)
  })

  it('combines rules with all / any', () => {
    const rules = [r({ field: 'city', value: 'Mumbai' }), r({})]
    expect(members({ match: 'all', rules }, [c])).toHaveLength(0)
    expect(members({ match: 'any', rules }, [c])).toHaveLength(1)
    expect(members({ match: 'all', rules: [] }, [c])).toHaveLength(1)
  })
})
