// POST /api/account/phone/verify { code } — check the code and mark the phone verified.
import { NextResponse } from 'next/server'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { SIGNUP_CODE_LENGTH, SIGNUP_MAX_ATTEMPTS as MAX_ATTEMPTS, hashCode, sameHash } from '@/lib/auth/phone-otp'
import { signedIn } from '../shared'

export async function POST(request: Request): Promise<Response> {
  const ctx = await signedIn()
  if (!ctx.ok) return ctx.error
  const { user, db } = ctx

  const limit = checkRateLimit(`otp-verify:${user.id}`, { limit: 10, windowMs: 60_000 })
  if (!limit.success) return rateLimitResponse(limit)

  const body = (await request.json().catch(() => null)) as { code?: string } | null
  const code = (body?.code ?? '').replace(/\D/g, '')
  if (code.length !== SIGNUP_CODE_LENGTH) return NextResponse.json({ error: 'invalid_code' }, { status: 400 })

  const { data: pending } = await db.from('phone_verifications').select('*').eq('user_id', user.id).maybeSingle()
  if (!pending) return NextResponse.json({ error: 'no_code' }, { status: 409 })
  if (new Date(pending.expires_at).getTime() < Date.now()) return NextResponse.json({ error: 'expired' }, { status: 410 })
  if (pending.attempts >= MAX_ATTEMPTS) return NextResponse.json({ error: 'too_many_attempts' }, { status: 429 })

  if (!sameHash(hashCode(code, user.id), pending.code_hash)) {
    await db.from('phone_verifications').update({ attempts: pending.attempts + 1 }).eq('user_id', user.id)
    return NextResponse.json({ error: 'wrong_code', attempts_left: Math.max(0, MAX_ATTEMPTS - pending.attempts - 1) }, { status: 400 })
  }

  const { error } = await db.from('profiles').update({ phone: pending.phone, phone_verified_at: new Date().toISOString() }).eq('user_id', user.id)
  if (error) {
    // The unique index refuses a number someone else verified in the meantime.
    return NextResponse.json({ error: error.code === '23505' ? 'phone_taken' : 'save_failed' }, { status: error.code === '23505' ? 409 : 500 })
  }
  await db.from('phone_verifications').delete().eq('user_id', user.id)
  return NextResponse.json({ verified: true, phone: `+${pending.phone}` })
}
