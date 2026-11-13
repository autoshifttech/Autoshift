// Phone verification settings (super admins).
//   GET  → settings, the sender's number and the OTP template's status at Meta
//   PUT  { enabled?, sender_account_id? } → save (switching on starts "required from now")
//   POST → create the OTP template on the sender's WhatsApp Business Account
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/ai/admin-client'
import { createOtpTemplate, getOtpSettings, otpTemplateStatus, saveOtpSettings, senderConfig } from '@/lib/auth/phone-otp'

async function superAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: NextResponse.json({ error: 'Please sign in again' }, { status: 401 }) } as const
  const db = supabaseAdmin()
  const { data } = await db.from('platform_admins').select('role').eq('user_id', user.id).maybeSingle()
  if (data?.role !== 'super_admin') return { ok: false, error: NextResponse.json({ error: 'Super admins only' }, { status: 403 }) } as const
  return { ok: true, user, db } as const
}

async function audit(db: ReturnType<typeof supabaseAdmin>, actor: string, action: string, details: Record<string, unknown>) {
  await db.from('audit_log').insert({ actor_id: actor, scope: 'platform', action, target: 'phone_otp', details })
}

export async function GET(): Promise<Response> {
  const ctx = await superAdmin()
  if (!ctx.ok) return ctx.error
  const settings = await getOtpSettings(ctx.db)
  let sender: { phone_number_id: string } | null = null
  let template: { status: string; reason: string | null } | null = null
  let problem: string | null = null
  if (settings.sender_account_id) {
    try {
      const cfg = await senderConfig(ctx.db, settings.sender_account_id)
      sender = { phone_number_id: cfg.phone_number_id }
      template = await otpTemplateStatus(cfg, settings)
    } catch (err) {
      problem = err instanceof Error ? err.message : String(err)
    }
  }
  const { count } = await ctx.db.from('profiles').select('user_id', { count: 'exact', head: true }).not('phone_verified_at', 'is', null)
  return NextResponse.json({ settings, sender, template, problem, verified_users: count ?? 0 })
}

export async function PUT(request: Request): Promise<Response> {
  const ctx = await superAdmin()
  if (!ctx.ok) return ctx.error
  const body = (await request.json().catch(() => null)) as { enabled?: boolean; sender_account_id?: string | null } | null
  if (!body) return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  const settings = await getOtpSettings(ctx.db)
  const next = { ...settings }
  if (body.sender_account_id !== undefined) {
    if (body.sender_account_id) {
      const { data } = await ctx.db.from('accounts').select('id').eq('id', body.sender_account_id).maybeSingle()
      if (!data) return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }
    next.sender_account_id = body.sender_account_id || null
  }
  if (body.enabled !== undefined) {
    if (body.enabled) {
      if (!next.sender_account_id) return NextResponse.json({ error: 'Choose the business whose WhatsApp number sends the codes first' }, { status: 409 })
      const status = await otpTemplateStatus(await senderConfig(ctx.db, next.sender_account_id), next).catch(() => null)
      if (status?.status !== 'APPROVED') return NextResponse.json({ error: 'The OTP template must be approved by Meta before turning this on' }, { status: 409 })
      if (!settings.enabled) next.required_since = new Date().toISOString()
    }
    next.enabled = body.enabled
  }
  await saveOtpSettings(ctx.db, next, ctx.user.id)
  await audit(ctx.db, ctx.user.id, 'phone_otp.update', { enabled: next.enabled, sender_account_id: next.sender_account_id })
  return NextResponse.json({ settings: next })
}

export async function POST(): Promise<Response> {
  const ctx = await superAdmin()
  if (!ctx.ok) return ctx.error
  const settings = await getOtpSettings(ctx.db)
  if (!settings.sender_account_id) return NextResponse.json({ error: 'Choose the business whose WhatsApp number sends the codes first' }, { status: 409 })
  try {
    const cfg = await senderConfig(ctx.db, settings.sender_account_id)
    const existing = await otpTemplateStatus(cfg, settings)
    if (existing) return NextResponse.json({ template: existing, created: false })
    const made = await createOtpTemplate(cfg, settings)
    await audit(ctx.db, ctx.user.id, 'phone_otp.template_create', { template: settings.template_name, meta_id: made.id })
    return NextResponse.json({ template: { status: made.status, reason: null }, created: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 })
  }
}
