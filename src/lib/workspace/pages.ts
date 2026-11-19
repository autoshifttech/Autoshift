// ============================================================
// Which pages this business has. The business type chosen at sign-up sets the starting pages; the
// AutoShift team can switch any page on or off for a business in the admin panel. A switched-off
// page is hidden from the menus and shows a "Request access" screen when opened by link.
// Read from the business's own account row; changes go through the backend.
// ============================================================

import { useEffect } from 'react'
import { createStore, useStore } from '@/lib/workspace/store'
import { createClient } from '@/lib/supabase/client'
import { isLive } from '@/lib/workspace/live'
import { backend } from '@/lib/backend/client'

export const BUSINESS_TYPES = ['retail', 'restaurant', 'clinic', 'salon', 'real_estate', 'education', 'services', 'other'] as const
export type BusinessType = (typeof BUSINESS_TYPES)[number]
export const SHOP_SOURCES = ['whatsapp', 'shopify', 'website'] as const
export type ShopSource = (typeof SHOP_SOURCES)[number]

/** Pages the AutoShift team can switch on or off. Everything else is always on. */
export const OPTIONAL_PAGES = ['leads', 'orders', 'appointments', 'insights', 'broadcasts', 'templates', 'drips', 'segments', 'automations', 'flows', 'ai_tools'] as const
export type OptionalPage = (typeof OPTIONAL_PAGES)[number]

export const PAGE_HREF: Record<OptionalPage, string> = {
  leads: '/leads',
  orders: '/orders',
  appointments: '/appointments',
  insights: '/insights',
  broadcasts: '/broadcasts',
  templates: '/templates',
  drips: '/drips',
  segments: '/segments',
  automations: '/automations',
  flows: '/flows',
  ai_tools: '/ai-tools',
}

export const isShopType = (t: string | null | undefined) => t === 'retail' || t === 'restaurant'

/** The optional page a path belongs to, or null for an always-on page. */
export function pageForPath(pathname: string): OptionalPage | null {
  return OPTIONAL_PAGES.find((p) => pathname === PAGE_HREF[p] || pathname.startsWith(`${PAGE_HREF[p]}/`)) ?? null
}

export interface PagesState {
  loaded: boolean
  /** Null pages on the account: every page is on (existing businesses). */
  all: boolean
  on: OptionalPage[]
  businessType: BusinessType | null
  shopSource: ShopSource | null
}

const ALL: PagesState = { loaded: false, all: true, on: [...OPTIONAL_PAGES], businessType: null, shopSource: null }
export const pagesStore = createStore<PagesState>(() => ALL)
let loading: Promise<void> | null = null

export function cleanPages(pages: readonly string[] | null | undefined): OptionalPage[] {
  const wanted = new Set(pages ?? [])
  return OPTIONAL_PAGES.filter((p) => wanted.has(p))
}

export function fromAccount(row: { business_type?: string | null; shop_source?: string | null; pages?: string[] | null } | null): PagesState {
  if (!row) return { ...ALL, loaded: true }
  const all = row.pages == null
  return {
    loaded: true,
    all,
    on: all ? [...OPTIONAL_PAGES] : cleanPages(row.pages),
    businessType: (BUSINESS_TYPES as readonly string[]).includes(row.business_type ?? '') ? (row.business_type as BusinessType) : null,
    shopSource: (SHOP_SOURCES as readonly string[]).includes(row.shop_source ?? '') ? (row.shop_source as ShopSource) : null,
  }
}

export function loadPages(force = false): Promise<void> {
  if (!isLive()) {
    pagesStore.set({ ...ALL, loaded: true })
    return Promise.resolve()
  }
  if (!loading || force) {
    loading = (async () => {
      const { data, error } = await createClient().from('accounts').select('business_type, shop_source, pages').limit(1).maybeSingle()
      // Before the database has these columns (or on any read error) nothing is hidden.
      pagesStore.set(error ? { ...ALL, loaded: true } : fromAccount(data))
    })().catch(() => {
      pagesStore.set({ ...ALL, loaded: true })
      loading = null
    })
  }
  return loading
}

export function usePages(): PagesState {
  useEffect(() => {
    void loadPages()
  }, [])
  return useStore(pagesStore, ALL)
}

export function isOn(state: PagesState, page: OptionalPage | null): boolean {
  return page === null || state.on.includes(page)
}

/** Sign-up: what the business uses AutoShift for. Sets the starting pages once. */
export async function chooseBusinessType(businessType: BusinessType, shopSource?: ShopSource | null): Promise<void> {
  const row = await backend<{ business_type: string; shop_source: string | null; optional_on: string[]; all: boolean }>('/v1/workspace/business-type', {
    method: 'PUT',
    body: { business_type: businessType, shop_source: shopSource ?? null },
  })
  pagesStore.set(fromAccount({ business_type: row.business_type, shop_source: row.shop_source, pages: row.all ? null : row.optional_on }))
}

export function requestPage(page: OptionalPage, note = ''): Promise<{ ticket?: string; already_requested?: boolean; already_on?: boolean }> {
  return backend('/v1/workspace/pages/request', { method: 'POST', body: { page, note } })
}
