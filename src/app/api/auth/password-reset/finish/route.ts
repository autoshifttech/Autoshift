// POST /api/auth/password-reset/finish { email, code, password } — set a new password with the code.
import { NextResponse } from 'next/server'
import { checkRateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { supabaseAdmin } from '@/lib/ai/admin-client'
import { MIN_PASSWORD, checkCode, setPassword } from '@/lib/auth/otp-codes'
import { userIdForEmail } from '../shared'

export async function POST(request: Request): Promise<Response> {
  const limit = checkRateLimit(`pw-reset-finish:${getClientIp(request)}`, { limit: 10, windowMs: 10 * 60_000 })
  if (!limit.success) return rateLimitResponse(limit)
  const body = (await request.json().catch(() => null)) as { email?: string; code?: string; password?: string } | null
  const password = body?.password ?? ''
  if (password.length < MIN_PASSWORD || password.length > 72) return NextResponse.json({ error: 'weak_password' }, { status: 400 })
  const userId = await userIdForEmail(body?.email ?? '')
  // Unknown email: the same answer as a wrong code.
  if (!userId) return NextResponse.json({ error: 'wrong_code' }, { status: 400 })
  const db = supabaseAdmin()
  const check = await checkCode(db, userId, 'password_reset', body?.code ?? '')
  if (!check.ok) return NextResponse.json(check, { status: check.error === 'expired' ? 410 : check.error === 'too_many_attempts' ? 429 : 400 })
  const failed = await setPassword(db, userId, password, 'password_reset')
  if (failed) return NextResponse.json({ error: 'save_failed' }, { status: 500 })
  return NextResponse.json({ changed: true })
}
