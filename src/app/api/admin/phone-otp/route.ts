// Phone verification settings (super admins).
//   GET  → settings, the sender's number and the OTP template's status at Meta
//   PUT  { enabled?, sender_account_id?, custom_sender?, admin_2fa? } → save
//        custom_sender { phone_number_id, waba_id, access_token } is checked with Meta, then stored
//        with the token encrypted (it is never sent back); null removes it.
//   POST → create the OTP template on the sender's WhatsApp Business Account
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/ai/admin-client'
import { checkSenderDetails, createOtpTemplate, getOtpSettings, hasSender, otpTemplateStatus, saveOtpSettings, senderFor, type OtpSettings } from '@/lib/auth/phone-otp'
import { encrypt } from '@/lib/whatsapp/encryption'
import { adminTokenFromCookies, verifyAdminToken } from '@/lib/admin/admin-token'

async function superAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: NextResponse.json({ error: 'Please sign in again' }, { status: 401 }) } as const
  const db = supabaseAdmin()
  const { data } = await db.from('platform_admins').select('role').eq('user_id', user.id).maybeSingle()
  if (data?.role !== 'super_admin') return { ok: false, error: NextResponse.json({ error: 'Super admins only' }, { status: 403 }) } as const
  // With admin sign-in codes on, settings also need this device's admin sign-in.
  const settings = await getOtpSettings(db)
  if (settings.admin_2fa && !(await verifyAdminToken(await adminTokenFromCookies(), user.id))) {
    return { ok: false, error: NextResponse.json({ error: 'Sign in to the admin panel again' }, { status: 401 }) } as const
  }
  return { ok: true, user, db } as const
}

/** Settings for the browser: the access token is never sent back, only its last four characters. */
function publicSettings(s: OtpSettings) {
  const c = s.custom_sender
  return { ...s, custom_sender: c ? { phone_number_id: c.phone_number_id, waba_id: c.waba_id, display_phone: c.display_phone ?? null, verified_name: c.verified_name ?? null, token_tail: c.token_tail ?? null } : null }
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
  if (hasSender(settings)) {
    try {
      const cfg = await senderFor(ctx.db, settings)
      sender = { phone_number_id: cfg.phone_number_id }
      template = await otpTemplateStatus(cfg, settings)
    } catch (err) {
      problem = err instanceof Error ? err.message : String(err)
    }
  }
  const { count } = await ctx.db.from('profiles').select('user_id', { count: 'exact', head: true }).not('phone_verified_at', 'is', null)
  const { data: me } = await ctx.db.from('profiles').select('phone, phone_verified_at').eq('user_id', ctx.user.id).maybeSingle()
  return NextResponse.json({ settings: publicSettings(settings), sender, template, problem, verified_users: count ?? 0, my_phone_verified: !!me?.phone_verified_at })
}

export async function PUT(request: Request): Promise<Response> {
  const ctx = await superAdmin()
  if (!ctx.ok) return ctx.error
  const body = (await request.json().catch(() => null)) as {
    enabled?: boolean
    sender_account_id?: string | null
    custom_sender?: { phone_number_id?: string; waba_id?: string; access_token?: string } | null
    admin_2fa?: boolean
  } | null
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
  if (body.custom_sender !== undefined) {
    if (body.custom_sender === null) {
      next.custom_sender = null
    } else {
      const phone_number_id = (body.custom_sender.phone_number_id ?? '').trim()
      const waba_id = (body.custom_sender.waba_id ?? '').trim()
      const token = (body.custom_sender.access_token ?? '').trim()
      if (!/^\d{6,25}$/.test(phone_number_id)) return NextResponse.json({ error: 'Enter the phone number ID (digits only) from Meta → WhatsApp → API setup' }, { status: 400 })
      if (!/^\d{6,25}$/.test(waba_id)) return NextResponse.json({ error: 'Enter the WhatsApp Business Account ID (digits only)' }, { status: 400 })
      // An empty token keeps the saved one (when only the ids change).
      if (!token && !settings.custom_sender?.access_token) return NextResponse.json({ error: 'Enter the access token' }, { status: 400 })
      const cfg = token ? { phone_number_id, waba_id, access_token: token } : { ...(await senderFor(ctx.db, settings)), phone_number_id, waba_id }
      let checked: { display_phone: string | null; verified_name: string | null }
      try {
        checked = await checkSenderDetails(cfg)
      } catch (err) {
        return NextResponse.json({ error: `Meta didn't accept these details: ${err instanceof Error ? err.message : String(err)}` }, { status: 400 })
      }
      next.custom_sender = {
        phone_number_id,
        waba_id,
        access_token: token ? encrypt(token) : settings.custom_sender!.access_token,
        display_phone: checked.display_phone,
        verified_name: checked.verified_name,
        token_tail: token ? token.slice(-4) : settings.custom_sender?.token_tail ?? null,
      }
    }
  }
  if (body.admin_2fa !== undefined) {
    if (body.admin_2fa) {
      if (!hasSender(next)) return NextResponse.json({ error: 'Set up the sending WhatsApp number first' }, { status: 409 })
      const status = await otpTemplateStatus(await senderFor(ctx.db, next), next).catch(() => null)
      if (status?.status !== 'APPROVED') return NextResponse.json({ error: 'The OTP template must be approved by Meta first' }, { status: 409 })
      // Don't let anyone lock themselves out: the admin switching it on needs a verified phone.
      const { data: me } = await ctx.db.from('profiles').select('phone_verified_at').eq('user_id', ctx.user.id).maybeSingle()
      if (!me?.phone_verified_at) return NextResponse.json({ error: 'Verify your own WhatsApp number first (business app → Settings → Security), so you can still sign in' }, { status: 409 })
    }
    next.admin_2fa = body.admin_2fa
  }
  if (body.enabled !== undefined) {
    if (body.enabled) {
      if (!hasSender(next)) return NextResponse.json({ error: 'Set up the sending WhatsApp number first' }, { status: 409 })
      const status = await otpTemplateStatus(await senderFor(ctx.db, next), next).catch(() => null)
      if (status?.status !== 'APPROVED') return NextResponse.json({ error: 'The OTP template must be approved by Meta before turning this on' }, { status: 409 })
      if (!settings.enabled) next.required_since = new Date().toISOString()
    }
    next.enabled = body.enabled
  }
  await saveOtpSettings(ctx.db, next, ctx.user.id)
  await audit(ctx.db, ctx.user.id, 'phone_otp.update', { enabled: next.enabled, sender_account_id: next.sender_account_id, custom_sender: next.custom_sender ? next.custom_sender.phone_number_id : null, admin_2fa: !!next.admin_2fa })
  return NextResponse.json({ settings: publicSettings(next) })
}

export async function POST(): Promise<Response> {
  const ctx = await superAdmin()
  if (!ctx.ok) return ctx.error
  const settings = await getOtpSettings(ctx.db)
  if (!hasSender(settings)) return NextResponse.json({ error: 'Set up the sending WhatsApp number first' }, { status: 409 })
  try {
    const cfg = await senderFor(ctx.db, settings)
    const existing = await otpTemplateStatus(cfg, settings)
    if (existing) return NextResponse.json({ template: existing, created: false })
    const made = await createOtpTemplate(cfg, settings)
    await audit(ctx.db, ctx.user.id, 'phone_otp.template_create', { template: settings.template_name, meta_id: made.id })
    return NextResponse.json({ template: { status: made.status, reason: null }, created: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 })
  }
}
