// POST /api/admin/login/start — after the password: open the panel, or send a WhatsApp code.
//   Admin sign-in codes off            → { done: true } (device token set)
//   This device already passed (token) → { done: true }
//   Otherwise                          → 6-digit code to the admin's verified WhatsApp number → { code_sent, phone }
import { NextResponse } from 'next/server'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { getOtpSettings, hasSender } from '@/lib/auth/phone-otp'
import { issueCode } from '@/lib/auth/otp-codes'
import { adminTokenFromCookies, verifyAdminToken } from '@/lib/admin/admin-token'
import { signedIn, staff } from '../shared'

export async function POST(): Promise<Response> {
  const ctx = await staff()
  if (!ctx.ok) return ctx.error
  const limit = checkRateLimit(`admin-login:${ctx.user.id}`, { limit: 10, windowMs: 60_000 })
  if (!limit.success) return rateLimitResponse(limit)

  const settings = await getOtpSettings(ctx.db)
  if (!settings.admin_2fa || !hasSender(settings)) return signedIn(ctx.db, ctx.user.id, 'password')
  if (await verifyAdminToken(await adminTokenFromCookies(), ctx.user.id)) return NextResponse.json({ done: true })

  const sent = await issueCode(ctx.db, ctx.user.id, 'admin_login')
  if (!sent.ok) return NextResponse.json({ error: sent.error, retry_after: sent.retry_after ?? null }, { status: sent.error === 'wait' || sent.error === 'too_many' ? 429 : sent.error === 'no_phone' ? 409 : 502 })
  return NextResponse.json({ code_sent: true, phone: sent.phone, resend_after: sent.resend_after })
}
