// The guided tours and first-visit page tips. Text lives in messages/*.json under Shifty.*;
// targets are the navigation links already on screen (found by their href), so the tour keeps
// working when the sidebar changes. A step whose target isn't visible (e.g. on a phone) shows
// its card in the middle instead.

export interface TourStep {
  key: string
  /** CSS selector for the thing to highlight; none = a centred card. */
  target?: string
  /** What Shifty does on this step. */
  act?: 'wave' | 'point' | 'think' | 'idea' | 'nod' | 'jump' | 'celebrate' | 'search' | 'launch'
}

const nav = (href: string) => `a[href="${href}"]`

export const BUSINESS_TOUR: TourStep[] = [
  { key: 'welcome', act: 'wave' },
  { key: 'inbox', target: nav('/inbox'), act: 'point' },
  { key: 'leads', target: nav('/leads'), act: 'search' },
  { key: 'agents', target: nav('/agents'), act: 'idea' },
  { key: 'flows', target: nav('/flows'), act: 'jump' },
  { key: 'broadcasts', target: nav('/broadcasts'), act: 'point' },
  { key: 'settings', target: nav('/settings'), act: 'nod' },
  { key: 'done', act: 'celebrate' },
]

export const ADMIN_TOUR: TourStep[] = [
  { key: 'welcome', act: 'wave' },
  { key: 'businesses', target: nav('/admin/businesses'), act: 'search' },
  { key: 'payments', target: nav('/admin/payments'), act: 'point' },
  { key: 'aiModels', target: nav('/admin/ai-models'), act: 'idea' },
  { key: 'support', target: nav('/admin/support'), act: 'point' },
  { key: 'settings', target: nav('/admin/settings'), act: 'nod' },
  { key: 'done', act: 'celebrate' },
]

/** Pages with a first-visit tip (the first path segment after the area prefix). */
export const BUSINESS_TIPS = ['dashboard', 'inbox', 'leads', 'contacts', 'insights', 'agents', 'ai-tools', 'broadcasts', 'drips', 'segments', 'automations', 'flows', 'templates', 'settings'] as const
export const ADMIN_TIPS = ['overview', 'businesses', 'payments', 'wallet', 'plans', 'whatsapp', 'ai', 'ai-models', 'system', 'support', 'announcements', 'team', 'audit', 'settings', 'emails'] as const

/** "/flows/abc" -> "flows"; "/admin" -> "overview"; "/admin/payments" -> "payments". */
export function pageKey(pathname: string, area: 'business' | 'admin'): string {
  const parts = pathname.split('/').filter(Boolean)
  if (area === 'admin') return parts[1] ?? 'overview'
  return parts[0] ?? 'dashboard'
}

/** Where to put the coach card next to a highlighted rectangle, kept on screen. */
export function placeCard(target: { x: number; y: number; w: number; h: number } | null, card: { w: number; h: number }, view: { w: number; h: number }, bottomSafe = 96) {
  const gap = 14
  if (!target) return { x: Math.max(12, (view.w - card.w) / 2), y: Math.max(12, (view.h - card.h) / 2) }
  // beside a tall, narrow target (a sidebar link): to its right
  if (target.x + target.w + gap + card.w < view.w - 12) {
    const y = Math.min(Math.max(12, target.y + target.h / 2 - card.h / 2), view.h - card.h - bottomSafe)
    return { x: target.x + target.w + gap, y }
  }
  const x = Math.min(Math.max(12, target.x + target.w / 2 - card.w / 2), view.w - card.w - 12)
  if (view.h - bottomSafe - (target.y + target.h) >= card.h + gap) return { x, y: target.y + target.h + gap }
  if (target.y - 12 >= card.h + gap) return { x, y: target.y - card.h - gap }
  return { x: view.w - card.w - 16, y: view.h - card.h - bottomSafe }
}
