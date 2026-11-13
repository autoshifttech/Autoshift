// GET /api/account/password — can this person change their password with a WhatsApp code?
import { NextResponse } from 'next/server'
import { codesAvailable, maskPhone, verifiedPhone } from '@/lib/auth/otp-codes'
import { signedIn } from '../phone/shared'

export async function GET(): Promise<Response> {
  const ctx = await signedIn()
  if (!ctx.ok) return ctx.error
  const [available, phone] = await Promise.all([codesAvailable(ctx.db), verifiedPhone(ctx.db, ctx.user.id)])
  return NextResponse.json({ available, phone: phone ? maskPhone(phone) : null })
}
