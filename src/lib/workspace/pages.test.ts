import { describe, expect, it } from 'vitest'
import { cleanPages, fromAccount, isOn, OPTIONAL_PAGES, pageForPath } from './pages'

describe('pages per business', () => {
  it('maps paths to their page; core pages have none', () => {
    expect(pageForPath('/orders')).toBe('orders')
    expect(pageForPath('/flows/abc')).toBe('flows')
    expect(pageForPath('/ai-tools')).toBe('ai_tools')
    expect(pageForPath('/dashboard')).toBeNull()
    expect(pageForPath('/inbox')).toBeNull()
    expect(pageForPath('/ordersx')).toBeNull()
  })

  it('a business with no page list keeps every page', () => {
    const s = fromAccount({ business_type: null, shop_source: null, pages: null })
    expect(s.all).toBe(true)
    expect(s.on).toEqual([...OPTIONAL_PAGES])
    expect(isOn(s, 'automations')).toBe(true)
    expect(fromAccount(null).all).toBe(true)
  })

  it('a clinic sees only its pages; core pages are always on', () => {
    const s = fromAccount({ business_type: 'clinic', shop_source: null, pages: ['flows', 'leads', 'made-up'] })
    expect(s.on).toEqual(['leads', 'flows'])
    expect(isOn(s, 'orders')).toBe(false)
    expect(isOn(s, null)).toBe(true)
    expect(s.businessType).toBe('clinic')
    expect(fromAccount({ business_type: 'bakery', pages: [] }).businessType).toBeNull()
  })

  it('cleans unknown pages and keeps the standard order', () => {
    expect(cleanPages(['orders', 'x', 'leads'])).toEqual(['leads', 'orders'])
    expect(cleanPages(null)).toEqual([])
  })
})
