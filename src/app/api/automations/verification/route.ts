// GET /api/automations/verification — is this business the one that sends AutoShift's
// verification codes? Only then does the builder offer the "Verification code requested"
// trigger and the "Send verification code" step.
import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/ai/admin-client'
import { getOtpSettings } from '@/lib/auth/phone-otp'

export async function GET(): Promise<Response> {
  try {
    const { accountId } = await getCurrentAccount()
    const settings = await getOtpSettings(supabaseAdmin())
    return NextResponse.json({ sender: !!settings.sender_account_id && settings.sender_account_id === accountId })
  } catch (err) {
    return toErrorResponse(err)
  }
}
