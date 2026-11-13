// POST /api/account/password/code — send a code to the signed-in person's verified WhatsApp.
import { NextResponse } from 'next/server'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { issueCode } from '@/lib/auth/otp-codes'
import { signedIn } from '../../phone/shared'

export async function POST(): Promise<Response> {
  const ctx = await signedIn()
  if (!ctx.ok) return ctx.error
  const limit = checkRateLimit(`pw-code:${ctx.user.id}`, { limit: 5, windowMs: 60_000 })
  if (!limit.success) return rateLimitResponse(limit)
  const r = await issueCode(ctx.db, ctx.user.id, 'password_change')
  if (!r.ok) return NextResponse.json(r, { status: r.error === 'wait' || r.error === 'too_many' ? 429 : r.error === 'send_failed' ? 502 : 409 })
  return NextResponse.json({ sent: true, phone: r.phone, resend_after: r.resend_after })
}
