import { SERVICES, SYSTEM_EVENTS, daysAgo, type Business, type Ticket } from './data'
import { daysBetween } from './format'
import type { AdminState } from './store'

export type Severity = 'critical' | 'warning' | 'info'

export interface AdminAlert {
  id: string
  severity: Severity
  title: string
  detail: string
  href: string
  at: string
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 }

/** Everything that needs the founder's attention, most urgent first. */
export function buildAlerts(businesses: Business[], state: Pick<AdminState, 'alerts' | 'dismissedAlerts' | 'tickets'>): AdminAlert[] {
  const { rules, lowWalletBelow } = state.alerts
  const out: AdminAlert[] = []
  for (const b of businesses) {
    const href = `/admin/businesses/${b.id}`
    const live = b.status !== 'cancelled' && b.status !== 'blocked'
    if (rules.quality && live && b.whatsapp.status === 'connected' && b.whatsapp.quality === 'red')
      out.push({ id: `q-${b.id}`, severity: 'critical', title: `${b.name}: number quality is low`, detail: 'Meta may limit or block this number. Review their recent broadcasts.', href, at: b.lastActiveAt })
    if (rules.paymentFailed && b.status === 'past_due')
      out.push({ id: `p-${b.id}`, severity: 'warning', title: `${b.name}: subscription payment failed`, detail: 'Razorpay will retry. Reach out if it fails again.', href, at: b.lastActiveAt })
    if (rules.lowWallet && live && b.status !== 'trial' && b.wallet < lowWalletBelow)
      out.push({ id: `w-${b.id}`, severity: b.wallet < 0 ? 'warning' : 'info', title: `${b.name}: wallet ${b.wallet < 0 ? 'is negative' : 'is low'}`, detail: 'Messages stop sending when credits run out.', href, at: b.lastActiveAt })
    if (rules.trialEnding && b.status === 'trial') {
      const left = daysBetween(b.trialEndsAt)
      if (left <= 3) out.push({ id: `t-${b.id}`, severity: 'info', title: `${b.name}: trial ends in ${Math.max(0, left)} day${left === 1 ? '' : 's'}`, detail: b.whatsapp.status === 'connected' ? 'Good moment to offer help choosing a plan.' : 'They never connected WhatsApp, offer a setup call.', href, at: b.createdAt })
    }
    if (rules.marketingSpike && b.flags.includes('Marketing spike'))
      out.push({ id: `m-${b.id}`, severity: 'warning', title: `${b.name}: unusual marketing volume`, detail: 'High sends with dropping quality can mean spam. Check opt-ins.', href, at: b.lastActiveAt })
  }
  if (rules.systemDown) {
    for (const s of SERVICES.filter((x) => x.status !== 'operational'))
      out.push({ id: `s-${s.id}`, severity: s.status === 'down' ? 'critical' : 'warning', title: `${s.name} is ${s.status}`, detail: s.detail, href: '/admin/system', at: daysAgo(0.02) })
    const unresolved = SYSTEM_EVENTS.filter((e) => !e.resolved).length
    if (unresolved) out.push({ id: 'events', severity: 'info', title: `${unresolved} system errors to review`, detail: 'Failed sends, webhook and payment errors.', href: '/admin/system', at: daysAgo(0.01) })
  }
  const urgent = state.tickets.filter((t: Ticket) => t.status === 'open' && (t.priority === 'urgent' || t.priority === 'high'))
  if (urgent.length) out.push({ id: 'tickets', severity: 'warning', title: `${urgent.length} urgent support request${urgent.length === 1 ? '' : 's'}`, detail: urgent.map((t) => t.subject).join(' · '), href: '/admin/support', at: urgent[0].createdAt })
  return out.filter((a) => !state.dismissedAlerts.includes(a.id)).sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.at.localeCompare(a.at))
}
