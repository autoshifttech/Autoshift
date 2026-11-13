// GET /api/account/phone — must this person verify a phone before using the app?
import { NextResponse } from 'next/server'
import { getOtpSettings, mustVerify } from '@/lib/auth/phone-otp'
import { signedIn } from './shared'

export async function GET(): Promise<Response> {
  const ctx = await signedIn()
  if (!ctx.ok) return ctx.error
  const settings = await getOtpSettings(ctx.db)
  return NextResponse.json({
    required: mustVerify(settings, ctx.user, ctx.profile),
    verified: !!ctx.profile?.phone_verified_at,
    phone: ctx.profile?.phone_verified_at ? ctx.profile.phone : null,
  })
}
