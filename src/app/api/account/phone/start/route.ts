// POST /api/account/phone/start { phone } — send a 6-digit code on WhatsApp.
import { NextResponse } from 'next/server'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { CODE_TTL_MIN, MAX_SENDS_PER_HOUR, RESEND_AFTER_SEC, getOtpSettings, hashCode, newCode, normalisePhone, sendOtp, senderConfig } from '@/lib/auth/phone-otp'
import { signedIn } from '../shared'

export async function POST(request: Request): Promise<Response> {
  const ctx = await signedIn()
  if (!ctx.ok) return ctx.error
  const { user, db, profile } = ctx
  if (profile?.phone_verified_at) return NextResponse.json({ error: 'Your phone is already verified' }, { status: 409 })

  const limit = checkRateLimit(`otp-start:${user.id}`, { limit: 5, windowMs: 60_000 })
  if (!limit.success) return rateLimitResponse(limit)

  const body = (await request.json().catch(() => null)) as { phone?: string } | null
  const phone = normalisePhone(body?.phone ?? '')
  if (!phone) return NextResponse.json({ error: 'invalid_phone' }, { status: 400 })

  const settings = await getOtpSettings(db)
  if (!settings.enabled || !settings.sender_account_id) return NextResponse.json({ error: 'not_enabled' }, { status: 409 })

  const { data: taken } = await db.from('profiles').select('user_id').eq('phone', phone).not('phone_verified_at', 'is', null).neq('user_id', user.id).limit(1)
  if (taken?.length) return NextResponse.json({ error: 'phone_taken' }, { status: 409 })

  const now = Date.now()
  const { data: pending } = await db.from('phone_verifications').select('*').eq('user_id', user.id).maybeSingle()
  let sends = 1
  let windowStart = new Date(now).toISOString()
  if (pending) {
    const since = (now - new Date(pending.last_sent_at).getTime()) / 1000
    if (since < RESEND_AFTER_SEC) return NextResponse.json({ error: 'wait', retry_after: Math.ceil(RESEND_AFTER_SEC - since) }, { status: 429 })
    const inWindow = now - new Date(pending.window_start).getTime() < 3600_000
    if (inWindow && pending.sends >= MAX_SENDS_PER_HOUR) return NextResponse.json({ error: 'too_many' }, { status: 429 })
    if (inWindow) {
      sends = pending.sends + 1
      windowStart = pending.window_start
    }
  }

  const code = newCode()
  try {
    await sendOtp(await senderConfig(db, settings.sender_account_id), settings, phone, code)
  } catch (err) {
    console.error('[phone-otp] send failed', err)
    return NextResponse.json({ error: 'send_failed', detail: err instanceof Error ? err.message : '' }, { status: 502 })
  }
  const { error } = await db.from('phone_verifications').upsert({
    user_id: user.id,
    phone,
    code_hash: hashCode(code, user.id),
    expires_at: new Date(now + CODE_TTL_MIN * 60_000).toISOString(),
    attempts: 0,
    sends,
    window_start: windowStart,
    last_sent_at: new Date(now).toISOString(),
  })
  if (error) return NextResponse.json({ error: 'save_failed' }, { status: 500 })
  return NextResponse.json({ sent: true, phone: `+${phone}`, expires_in: CODE_TTL_MIN * 60, resend_after: RESEND_AFTER_SEC })
}
