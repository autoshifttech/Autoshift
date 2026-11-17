// ============================================================
// Orders the AI shop assistant took on WhatsApp (Orders page).
// Read straight from the database (row-level security keeps each business to its own); every change
// goes through the backend, which checks the step, tells the customer and keeps the audit log.
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isLive } from '@/lib/workspace/live'
import { backend } from '@/lib/backend/client'

export interface OrderItem {
  code: string
  name: string
  qty: number
  price_paise: number
  total_paise: number
}

export type OrderStatus = 'new' | 'packed' | 'shipped' | 'delivered' | 'cancelled'
export type PaymentStatus = 'awaiting' | 'paid' | 'cod' | 'expired' | 'refunded'
export type OrderAction = 'packed' | 'shipped' | 'delivered' | 'cancelled' | 'resend_link'

export interface ShopOrder {
  id: string
  number: number
  status: OrderStatus
  payment_status: PaymentStatus
  payment_method: 'online' | 'cod'
  items: OrderItem[]
  subtotal_paise: number
  delivery_paise: number
  total_paise: number
  customer_name: string
  customer_phone: string
  address: string
  note: string
  tracking: string
  payment_url: string | null
  conversation_id: string | null
  contact_id: string | null
  created_at: string
  paid_at: string | null
}

/** Filters on the page. "todo" = paid (or cash on delivery) but not yet shipped. */
export const ORDER_VIEWS = ['todo', 'awaiting', 'shipped', 'delivered', 'cancelled', 'all'] as const
export type OrderView = (typeof ORDER_VIEWS)[number]

export function inView(o: ShopOrder, view: OrderView): boolean {
  switch (view) {
    case 'todo':
      return (o.status === 'new' || o.status === 'packed') && (o.payment_status === 'paid' || o.payment_status === 'cod')
    case 'awaiting':
      return o.status !== 'cancelled' && (o.payment_status === 'awaiting' || o.payment_status === 'expired')
    case 'shipped':
      return o.status === 'shipped'
    case 'delivered':
      return o.status === 'delivered'
    case 'cancelled':
      return o.status === 'cancelled'
    default:
      return true
  }
}

/** The next steps the team can take, in the order they appear. */
export function nextActions(o: ShopOrder): OrderAction[] {
  if (o.status === 'cancelled' || o.status === 'delivered') return []
  const settled = o.payment_status === 'paid' || o.payment_status === 'cod'
  const out: OrderAction[] = []
  if (settled) {
    if (o.status === 'new') out.push('packed')
    if (o.status === 'new' || o.status === 'packed') out.push('shipped')
    out.push('delivered')
  } else if (o.payment_method === 'online') {
    out.push('resend_link')
  }
  out.push('cancelled')
  return out
}

export function rupees(paise: number, locale = 'en-IN'): string {
  return `₹${(paise / 100).toLocaleString(locale === 'ko' ? 'ko-KR' : 'en-IN', { maximumFractionDigits: 2 })}`
}

export function matches(o: ShopOrder, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/^#/, '')
  if (!q) return true
  const digits = q.replace(/\D/g, '')
  return String(o.number).includes(q) || o.customer_name.toLowerCase().includes(q) || (digits.length >= 4 && o.customer_phone.replace(/\D/g, '').includes(digits))
}

const COLUMNS = 'id, number, status, payment_status, payment_method, items, subtotal_paise, delivery_paise, total_paise, customer_name, customer_phone, address, note, tracking, payment_url, conversation_id, contact_id, created_at, paid_at'

/** The newest 200 orders, refreshed every 30 seconds while the page is open. */
export function useOrders() {
  const [orders, setOrders] = useState<ShopOrder[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    if (!isLive()) {
      setLoaded(true)
      return
    }
    const { data, error: err } = await createClient().from('shop_orders').select(COLUMNS).order('created_at', { ascending: false }).limit(200)
    if (err) {
      console.error('[orders] load failed', err)
      setError(true)
    } else {
      setOrders((data ?? []) as ShopOrder[])
      setError(false)
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    const first = setTimeout(() => void load(), 0)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 30000)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [load])

  const replace = useCallback((order: ShopOrder) => setOrders((list) => list.map((o) => (o.id === order.id ? { ...o, ...order } : o))), [])
  return { orders, loaded, error, reload: load, replace }
}

export interface ActionResult {
  order: ShopOrder
  notified: boolean
  not_notified_reason: string | null
}

export function updateOrder(id: string, action: OrderAction, opts: { tracking?: string; notify: boolean }): Promise<ActionResult> {
  return backend<ActionResult>(`/v1/orders/${id}`, { method: 'PATCH', body: { action, tracking: opts.tracking ?? null, notify: opts.notify } })
}
