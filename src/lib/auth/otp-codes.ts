/**
 * One-time WhatsApp codes for account actions (change or reset a password, admin sign-in), sent to the person's
 * verified phone from AutoShift's own number. Server-only.
 *
 * Same rules as phone verification: 6 digits, stored as a salted hash, 10 minutes, 5 tries,
 * one send a minute and 5 an hour.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { CODE_TTL_MIN, MAX_ATTEMPTS, MAX_SENDS_PER_HOUR, RESEND_AFTER_SEC, getOtpSettings, hasSender, hashCode, newCode, sameHash, sendOtp, senderFor } from './phone-otp'

export type OtpPurpose = 'password_change' | 'password_reset' | 'admin_login'

export type IssueResult =
  | { ok: true; phone: string; resend_after: number }
  | { ok: false; error: 'not_available' | 'no_phone' | 'wait' | 'too_many' | 'send_failed'; retry_after?: number; detail?: string }

export type CheckResult = { ok: true } | { ok: false; error: 'no_code' | 'expired' | 'too_many_attempts' | 'wrong_code' | 'invalid_code'; attempts_left?: number }

/** "+91 •••••• 3210": enough to recognise your own number, not enough to learn someone else's. */
export function maskPhone(digits: string): string {
  return `+${digits.slice(0, Math.max(1, digits.length - 10))} •••••• ${digits.slice(-4)}`
}

/** Can AutoShift send codes at all (a sending number is set)? */
export async function codesAvailable(db: SupabaseClient): Promise<boolean> {
  const s = await getOtpSettings(db)
  return hasSender(s)
}

/** The person's verified phone (digits), or null. */
export async function verifiedPhone(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await db.from('profiles').select('phone, phone_verified_at').eq('user_id', userId).maybeSingle()
  return data?.phone_verified_at && data.phone ? data.phone : null
}

export async function issueCode(db: SupabaseClient, userId: string, purpose: OtpPurpose): Promise<IssueResult> {
  const settings = await getOtpSettings(db)
  if (!hasSender(settings)) return { ok: false, error: 'not_available' }
  const phone = await verifiedPhone(db, userId)
  if (!phone) return { ok: false, error: 'no_phone' }

  const now = Date.now()
  const { data: pending } = await db.from('otp_codes').select('*').eq('user_id', userId).eq('purpose', purpose).maybeSingle()
  let sends = 1
  let windowStart = new Date(now).toISOString()
  if (pending) {
    const since = (now - new Date(pending.last_sent_at).getTime()) / 1000
    if (since < RESEND_AFTER_SEC) return { ok: false, error: 'wait', retry_after: Math.ceil(RESEND_AFTER_SEC - since) }
    const inWindow = now - new Date(pending.window_start).getTime() < 3600_000
    if (inWindow && pending.sends >= MAX_SENDS_PER_HOUR) return { ok: false, error: 'too_many' }
    if (inWindow) {
      sends = pending.sends + 1
      windowStart = pending.window_start
    }
  }

  const code = newCode()
  try {
    await sendOtp(await senderFor(db, settings), settings, phone, code)
  } catch (err) {
    console.error('[otp-codes] send failed', err)
    return { ok: false, error: 'send_failed', detail: err instanceof Error ? err.message : '' }
  }
  const { error } = await db.from('otp_codes').upsert({
    user_id: userId,
    purpose,
    code_hash: hashCode(`${purpose}:${code}`, userId),
    expires_at: new Date(now + CODE_TTL_MIN * 60_000).toISOString(),
    attempts: 0,
    sends,
    window_start: windowStart,
    last_sent_at: new Date(now).toISOString(),
  })
  if (error) return { ok: false, error: 'send_failed', detail: error.message }
  return { ok: true, phone: maskPhone(phone), resend_after: RESEND_AFTER_SEC }
}

/** Checks a code; a right code is used up, a wrong one counts as a try. */
export async function checkCode(db: SupabaseClient, userId: string, purpose: OtpPurpose, raw: string): Promise<CheckResult> {
  const code = (raw ?? '').replace(/\D/g, '')
  if (code.length !== 6) return { ok: false, error: 'invalid_code' }
  const { data: pending } = await db.from('otp_codes').select('*').eq('user_id', userId).eq('purpose', purpose).maybeSingle()
  if (!pending) return { ok: false, error: 'no_code' }
  if (new Date(pending.expires_at).getTime() < Date.now()) return { ok: false, error: 'expired' }
  if (pending.attempts >= MAX_ATTEMPTS) return { ok: false, error: 'too_many_attempts' }
  if (!sameHash(hashCode(`${purpose}:${code}`, userId), pending.code_hash)) {
    await db.from('otp_codes').update({ attempts: pending.attempts + 1 }).eq('user_id', userId).eq('purpose', purpose)
    return { ok: false, error: 'wrong_code', attempts_left: Math.max(0, MAX_ATTEMPTS - pending.attempts - 1) }
  }
  await db.from('otp_codes').delete().eq('user_id', userId).eq('purpose', purpose)
  return { ok: true }
}

export const MIN_PASSWORD = 8

/** Sets a new password with the service role, and notes it in the audit log. */
export async function setPassword(db: SupabaseClient, userId: string, password: string, how: OtpPurpose): Promise<string | null> {
  const { error } = await db.auth.admin.updateUserById(userId, { password })
  if (error) return error.message
  const { data } = await db.from('profiles').select('account_id').eq('user_id', userId).maybeSingle()
  await db.from('audit_log').insert({ actor_id: userId, account_id: data?.account_id ?? null, scope: 'account', action: how === 'password_reset' ? 'password.reset' : 'password.change', target: userId, details: { via: 'whatsapp_code' } })
  return null
}
