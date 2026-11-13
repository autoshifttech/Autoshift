// POST /api/auth/password-reset/start { email } — forgot password: a code to the account's verified
// WhatsApp. The answer is the same whether or not the email exists (no account discovery).
import { NextResponse } from 'next/server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { supabaseAdmin } from '@/lib/ai/admin-client'
import { codesAvailable, issueCode } from '@/lib/auth/otp-codes'
import { userIdForEmail } from '../shared'

export async function POST(request: Request): Promise<Response> {
  const ip = getClientIp(request)
  const limit = checkRateLimit(`pw-reset-start:${ip}`, { limit: 5, windowMs: 10 * 60_000 })
  if (!limit.success) return rateLimitResponse(limit)
  const body = (await request.json().catch(() => null)) as { email?: string } | null
  const email = (body?.email ?? '').trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
  const perEmail = checkRateLimit(`pw-reset-email:${email}`, { limit: 3, windowMs: 10 * 60_000 })
  if (!perEmail.success) return rateLimitResponse(perEmail)

  const db = supabaseAdmin()
  if (!(await codesAvailable(db))) return NextResponse.json({ error: 'not_available' }, { status: 409 })
  const userId = await userIdForEmail(email)
  if (userId) {
    const r = await issueCode(db, userId, 'password_reset')
    if (!r.ok && r.error !== 'no_phone') console.warn('[password-reset] not sent:', r.error)
  }
  return NextResponse.json({ accepted: true })
}
