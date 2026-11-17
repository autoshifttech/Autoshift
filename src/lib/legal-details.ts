// The business details shown on the legal pages (Contact, Refund, Shipping, Terms...). The AutoShift
// team edits them in Admin → Settings; they're stored in platform_settings under "business_details".
// Until they're filled in, the defaults from lib/legal.ts are used. Server-only.

import { LEGAL } from '@/lib/legal'

export interface BusinessDetails {
  company: string
  address: string
  email: string
  whatsapp: string
  gstin: string
  grievanceOfficer: string
  supportHours: string
  /** Working days to send an approved refund back to the original payment method. */
  refundDays: number
}

export const BUSINESS_DETAILS_KEY = 'business_details'

export const DEFAULT_DETAILS: BusinessDetails = {
  company: LEGAL.company,
  address: LEGAL.address,
  email: LEGAL.email,
  whatsapp: LEGAL.whatsapp,
  gstin: LEGAL.sellerGstin,
  grievanceOfficer: LEGAL.grievanceOfficer,
  supportHours: 'Monday to Saturday, 10am to 6pm IST',
  refundDays: 7,
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** Cleans what an admin typed; empty fields fall back to the defaults. Returns problems too. */
export function cleanDetails(raw: unknown): { details: BusinessDetails; problems: string[] } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const problems: string[] = []
  const email = str(r.email, 120)
  if (email && !/^\S+@\S+\.\S+$/.test(email)) problems.push('email')
  const gstin = str(r.gstin, 15).toUpperCase()
  if (gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) problems.push('gstin')
  const days = Number(r.refundDays)
  if (r.refundDays !== undefined && r.refundDays !== '' && !(Number.isInteger(days) && days >= 1 && days <= 30)) problems.push('refundDays')
  const details: BusinessDetails = {
    company: str(r.company, 120) || DEFAULT_DETAILS.company,
    address: str(r.address, 300) || DEFAULT_DETAILS.address,
    email: email || DEFAULT_DETAILS.email,
    whatsapp: str(r.whatsapp, 30) || DEFAULT_DETAILS.whatsapp,
    gstin,
    grievanceOfficer: str(r.grievanceOfficer, 120) || DEFAULT_DETAILS.grievanceOfficer,
    supportHours: str(r.supportHours, 120) || DEFAULT_DETAILS.supportHours,
    refundDays: Number.isInteger(days) && days >= 1 && days <= 30 ? days : DEFAULT_DETAILS.refundDays,
  }
  return { details, problems }
}

/** For the public pages: never throws, falls back to the defaults. */
export async function getBusinessDetails(): Promise<BusinessDetails> {
  try {
    const { supabaseAdmin } = await import('@/lib/ai/admin-client')
    const { data } = await supabaseAdmin().from('platform_settings').select('value').eq('key', BUSINESS_DETAILS_KEY).maybeSingle()
    return cleanDetails(data?.value).details
  } catch {
    return DEFAULT_DETAILS
  }
}
