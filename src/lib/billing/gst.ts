/**
 * GST for AutoShift invoices: the buyer's details, GSTIN checks and the
 * tax split. Within the seller's state GST is CGST 9% + SGST 9%; to any
 * other state it is IGST 18%. Kept in the browser until billing runs on
 * the backend.
 */
import { createStore, useStore } from '@/lib/workspace/store'

export const GST_RATE = 0.18

/** GST state codes (first two digits of a GSTIN) and names. */
export const STATES: { code: string; name: string }[] = [
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '18', name: 'Assam' },
  { code: '10', name: 'Bihar' },
  { code: '04', name: 'Chandigarh' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '07', name: 'Delhi' },
  { code: '30', name: 'Goa' },
  { code: '24', name: 'Gujarat' },
  { code: '06', name: 'Haryana' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '20', name: 'Jharkhand' },
  { code: '29', name: 'Karnataka' },
  { code: '32', name: 'Kerala' },
  { code: '38', name: 'Ladakh' },
  { code: '31', name: 'Lakshadweep' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '27', name: 'Maharashtra' },
  { code: '14', name: 'Manipur' },
  { code: '17', name: 'Meghalaya' },
  { code: '15', name: 'Mizoram' },
  { code: '13', name: 'Nagaland' },
  { code: '21', name: 'Odisha' },
  { code: '34', name: 'Puducherry' },
  { code: '03', name: 'Punjab' },
  { code: '08', name: 'Rajasthan' },
  { code: '11', name: 'Sikkim' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '36', name: 'Telangana' },
  { code: '16', name: 'Tripura' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '19', name: 'West Bengal' },
]

export const stateName = (code: string) => STATES.find((s) => s.code === code)?.name ?? ''

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** The 15th character of a GSTIN is a checksum of the first 14. */
export function gstinCheckChar(first14: string): string {
  let sum = 0
  for (let i = 0; i < 14; i++) {
    const product = CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2)
    sum += Math.floor(product / 36) + (product % 36)
  }
  return CHARS[(36 - (sum % 36)) % 36]
}

export type GstinProblem = 'format' | 'state' | 'checksum'

export function checkGstin(raw: string): { ok: true; stateCode: string } | { ok: false; problem: GstinProblem } {
  const g = raw.trim().toUpperCase()
  if (!GSTIN_RE.test(g)) return { ok: false, problem: 'format' }
  if (!STATES.some((s) => s.code === g.slice(0, 2))) return { ok: false, problem: 'state' }
  if (gstinCheckChar(g.slice(0, 14)) !== g[14]) return { ok: false, problem: 'checksum' }
  return { ok: true, stateCode: g.slice(0, 2) }
}

export interface TaxSplit {
  subtotal: number
  cgst: number
  sgst: number
  igst: number
  total: number
  intraState: boolean
}

/** Split 18% GST by place of supply, in rupees rounded to paise. */
export function taxSplit(subtotal: number, buyerState: string, sellerState: string): TaxSplit {
  const r = (n: number) => Math.round(n * 100) / 100
  const intraState = buyerState === sellerState
  const half = r(subtotal * (GST_RATE / 2))
  const cgst = intraState ? half : 0
  const sgst = intraState ? half : 0
  const igst = intraState ? 0 : r(subtotal * GST_RATE)
  return { subtotal, cgst, sgst, igst, total: r(subtotal + cgst + sgst + igst), intraState }
}

export interface BillingDetails {
  legalName: string
  hasGstin: boolean
  gstin: string
  stateCode: string
  address: string
  city: string
  pincode: string
  email: string
}

export const emptyBillingDetails = (): BillingDetails => ({ legalName: '', hasGstin: false, gstin: '', stateCode: '', address: '', city: '', pincode: '', email: '' })

export type BillingField = 'legalName' | 'gstin' | 'stateCode' | 'address' | 'city' | 'pincode' | 'email'

/** What's missing or wrong. With a GSTIN the full address is needed (B2B invoice). */
export function billingErrors(d: BillingDetails): Partial<Record<BillingField, string>> {
  const e: Partial<Record<BillingField, string>> = {}
  if (!d.legalName.trim()) e.legalName = 'required'
  if (!d.stateCode) e.stateCode = 'required'
  if (d.email && !/^\S+@\S+\.\S+$/.test(d.email.trim())) e.email = 'invalid'
  if (d.hasGstin) {
    const g = checkGstin(d.gstin)
    if (!g.ok) e.gstin = g.problem
    else if (d.stateCode && g.stateCode !== d.stateCode) e.stateCode = 'mismatch'
    if (!d.address.trim()) e.address = 'required'
    if (!d.city.trim()) e.city = 'required'
    if (!/^[1-9][0-9]{5}$/.test(d.pincode.trim())) e.pincode = 'invalid'
  }
  return e
}

export const billingDetailsStore = createStore(emptyBillingDetails, 'autoshift.billingDetails.v1')
const SERVER = emptyBillingDetails()
export const useBillingDetails = () => useStore(billingDetailsStore, SERVER)
