/**
 * Delivers a one-time code. AutoShift's own business can send codes with its own automation
 * ("Verification code requested" → "Send verification code", plus any steps it likes, such as
 * tagging new sign-ups). When no such automation is switched on, or it didn't send the code, the
 * code goes out directly, so nobody is ever left without one. Server-only.
 *
 * The code itself is never stored in automation logs, parked runs or the inbox.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import { runAutomationsForTrigger } from '@/lib/automations/engine'
import { findOrCreateContact, resolveAuditUserId } from '@/lib/api/v1/contacts'
import { getOtpSettings, sendOtp, senderConfig } from './phone-otp'

export type OtpDeliveryPurpose = 'phone_verification' | 'password_change' | 'password_reset'

/** Sends `code` to `phone` (digits). Returns how it went out. Throws only when nothing could send it. */
export async function deliverCode(db: SupabaseClient, phone: string, code: string, purpose: OtpDeliveryPurpose): Promise<'automation' | 'direct'> {
  const settings = await getOtpSettings(db)
  const sender = settings.sender_account_id
  if (!sender) throw new Error('No business is set to send verification codes')

  try {
    const { data: automations } = await db.from('automations').select('id').eq('account_id', sender).eq('trigger_type', 'verification_code_requested').eq('is_active', true)
    const ids = (automations ?? []).map((a) => a.id as string)
    if (ids.length) {
      const owner = await resolveAuditUserId(db, sender)
      const contact = await findOrCreateContact(db, sender, owner, { phone: `+${phone}` })
      const startedAt = new Date(Date.now() - 1000).toISOString()
      await runAutomationsForTrigger({ accountId: sender, triggerType: 'verification_code_requested', contactId: contact.id, context: { otp: { code, purpose }, vars: { purpose } } })
      // Did one of them actually send the code?
      const { data: logs } = await db.from('automation_logs').select('steps_executed').in('automation_id', ids).eq('contact_id', contact.id).gte('created_at', startedAt)
      const sent = (logs ?? []).some((l) => ((l.steps_executed as { step_type: string; status: string }[] | null) ?? []).some((s) => s.step_type === 'send_verification_code' && s.status === 'success'))
      if (sent) return 'automation'
      console.warn('[otp] the verification automation did not send the code; sending it directly')
    }
  } catch (err) {
    console.error('[otp] verification automation failed; sending directly', err)
  }

  await sendOtp(await senderConfig(db, sender), settings, phone, code)
  return 'direct'
}
