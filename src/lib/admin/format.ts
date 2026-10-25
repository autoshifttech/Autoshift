import { ADMIN_NOW } from './data'

export const inr = (n: number, fraction = 0) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: fraction, maximumFractionDigits: fraction }).format(n)

/** ₹1.2L / ₹3.4Cr style for big KPI numbers. */
export function inrShort(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(abs >= 1e6 ? 1 : 2)}L`
  return inr(n)
}

/** Axis labels: ₹40K, ₹1.2L, ₹3.1Cr. */
export function inrCompact(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e7) return `${sign}₹${+(abs / 1e7).toFixed(1)}Cr`
  if (abs >= 1e5) return `${sign}₹${+(abs / 1e5).toFixed(1)}L`
  if (abs >= 1e3) return `${sign}₹${+(abs / 1e3).toFixed(0)}K`
  return `${sign}₹${abs}`
}

export const num = (n: number) => new Intl.NumberFormat('en-IN').format(n)

export const pct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`

export const date = (iso: string, withYear = false) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'Asia/Kolkata' })

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })

/** "5m ago", "3h ago", "2d ago", "in 4d", measured from the sample data's today. */
export function relTime(iso: string, now = ADMIN_NOW): string {
  const diff = now - new Date(iso).getTime()
  const future = diff < -60e3
  const s = Math.abs(diff) / 1000
  if (!future && s < 60) return 'just now'
  const [v, u] = s < 3600 ? [Math.round(s / 60), 'm'] : s < 86400 ? [Math.round(s / 3600), 'h'] : s < 86400 * 60 ? [Math.round(s / 86400), 'd'] : [Math.round(s / (86400 * 30)), 'mo']
  return future ? `in ${v}${u}` : `${v}${u} ago`
}

export const daysBetween = (fromIso: string, now = ADMIN_NOW) => Math.ceil((new Date(fromIso).getTime() - now) / 864e5)

/** Turn rows into a CSV download. */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
