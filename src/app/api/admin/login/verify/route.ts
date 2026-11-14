// POST /api/admin/login/verify { code } — check the admin's WhatsApp code and trust this device for 30 days.
import { NextResponse } from 'next/server'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { checkCode } from '@/lib/auth/otp-codes'
import { signedIn, staff } from '../shared'

export async function POST(request: Request): Promise<Response> {
  const ctx = await staff()
  if (!ctx.ok) return ctx.error
  const limit = checkRateLimit(`admin-login-verify:${ctx.user.id}`, { limit: 10, windowMs: 60_000 })
  if (!limit.success) return rateLimitResponse(limit)
  const body = (await request.json().catch(() => null)) as { code?: string } | null
  const result = await checkCode(ctx.db, ctx.user.id, 'admin_login', body?.code ?? '')
  if (!result.ok) {
    await ctx.db.from('audit_log').insert({ actor_id: ctx.user.id, scope: 'platform', action: 'admin.sign_in_failed', target: ctx.user.id, details: { reason: result.error } })
    return NextResponse.json({ error: result.error, attempts_left: result.attempts_left ?? null }, { status: 400 })
  }
  return signedIn(ctx.db, ctx.user.id, 'whatsapp_code')
}
