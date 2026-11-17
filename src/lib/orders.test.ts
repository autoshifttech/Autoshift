import { describe, expect, it } from 'vitest'
import { inView, matches, nextActions, rupees, type ShopOrder } from './orders'
import { cleanShop } from './assistants/backend-sync'

const order = (over: Partial<ShopOrder> = {}): ShopOrder => ({
  id: 'o1', number: 1001, status: 'new', payment_status: 'awaiting', payment_method: 'online', items: [],
  subtotal_paise: 99800, delivery_paise: 5000, total_paise: 104800, customer_name: 'Asha Rao', customer_phone: '+919876543210',
  address: '12 MG Road', note: '', tracking: '', payment_url: 'https://rzp.io/i/x', conversation_id: 'c1', contact_id: 'k1',
  created_at: '2026-11-17T10:00:00Z', paid_at: null, ...over,
})

describe('orders', () => {
  it('puts each order in the right view', () => {
    expect(inView(order(), 'awaiting')).toBe(true)
    expect(inView(order(), 'todo')).toBe(false)
    expect(inView(order({ payment_status: 'paid' }), 'todo')).toBe(true)
    expect(inView(order({ payment_method: 'cod', payment_status: 'cod', status: 'packed' }), 'todo')).toBe(true)
    expect(inView(order({ status: 'cancelled' }), 'awaiting')).toBe(false)
  })

  it('offers only the steps that make sense', () => {
    expect(nextActions(order())).toEqual(['resend_link', 'cancelled'])
    expect(nextActions(order({ payment_status: 'paid' }))).toEqual(['packed', 'shipped', 'delivered', 'cancelled'])
    expect(nextActions(order({ payment_status: 'paid', status: 'shipped' }))).toEqual(['delivered', 'cancelled'])
    expect(nextActions(order({ status: 'delivered', payment_status: 'paid' }))).toEqual([])
  })

  it('finds orders by number, name or phone', () => {
    expect(matches(order(), '#1001')).toBe(true)
    expect(matches(order(), 'asha')).toBe(true)
    expect(matches(order(), '98765')).toBe(true)
    expect(matches(order(), 'ravi')).toBe(false)
  })

  it('formats rupees', () => {
    expect(rupees(104800)).toBe('₹1,048')
    expect(rupees(149850)).toBe('₹1,498.5')
  })

  it('keeps shop settings within what the backend accepts', () => {
    const s = cleanShop({ enabled: true, delivery_fee: -5, cod_max: 1e12, language: 'xx' as never, delivery_note: 'x'.repeat(400) })
    expect(s.delivery_fee).toBe(0)
    expect(s.cod_max).toBe(10_000_000)
    expect(s.language).toBe('en')
    expect(s.delivery_note).toHaveLength(300)
    expect(cleanShop().enabled).toBe(false)
  })
})
