// Business details for the legal pages (super admins).
//   GET → the saved details (or the defaults)
//   PUT { company, address, email, whatsapp, gstin, grievanceOfficer, supportHours, refundDays } → save
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/ai/admin-client'
import { BUSINESS_DETAILS_KEY, cleanDetails, getBusinessDetails } from '@/lib/legal-details'

async function superAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: NextResponse.json({ error: 'Please sign in again' }, { status: 401 }) } as const
  const db = supabaseAdmin()
  const { data } = await db.from('platform_admins').select('role').eq('user_id', user.id).maybeSingle()
  if (data?.role !== 'super_admin') return { ok: false, error: NextResponse.json({ error: 'Super admins only' }, { status: 403 }) } as const
  return { ok: true, user, db } as const
}

export async function GET(): Promise<Response> {
  const ctx = await superAdmin()
  if (!ctx.ok) return ctx.error
  return NextResponse.json({ details: await getBusinessDetails() })
}

export async function PUT(request: Request): Promise<Response> {
  const ctx = await superAdmin()
  if (!ctx.ok) return ctx.error
  const body = await request.json().catch(() => null)
  const { details, problems } = cleanDetails(body)
  if (problems.length) return NextResponse.json({ error: 'Check these fields', fields: problems }, { status: 422 })
  const { error } = await ctx.db.from('platform_settings').upsert({ key: BUSINESS_DETAILS_KEY, value: details, updated_by: ctx.user.id, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await ctx.db.from('audit_log').insert({ actor_id: ctx.user.id, scope: 'platform', action: 'business_details.update', target: BUSINESS_DETAILS_KEY, details: { company: details.company } })
  return NextResponse.json({ details })
}
