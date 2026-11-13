// POST /api/account/password/change { code, password } — set a new password with a WhatsApp code.
import { NextResponse } from 'next/server'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { MIN_PASSWORD, checkCode, setPassword } from '@/lib/auth/otp-codes'
import { signedIn } from '../../phone/shared'

export async function POST(request: Request): Promise<Response> {
  const ctx = await signedIn()
  if (!ctx.ok) return ctx.error
  const limit = checkRateLimit(`pw-change:${ctx.user.id}`, { limit: 10, windowMs: 60_000 })
  if (!limit.success) return rateLimitResponse(limit)
  const body = (await request.json().catch(() => null)) as { code?: string; password?: string } | null
  const password = body?.password ?? ''
  if (password.length < MIN_PASSWORD || password.length > 72) return NextResponse.json({ error: 'weak_password' }, { status: 400 })
  const check = await checkCode(ctx.db, ctx.user.id, 'password_change', body?.code ?? '')
  if (!check.ok) return NextResponse.json(check, { status: check.error === 'expired' ? 410 : check.error === 'too_many_attempts' ? 429 : 400 })
  const failed = await setPassword(ctx.db, ctx.user.id, password, 'password_change')
  if (failed) return NextResponse.json({ error: 'save_failed', detail: failed }, { status: 500 })
  return NextResponse.json({ changed: true })
}
