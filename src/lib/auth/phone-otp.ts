/**
 * WhatsApp codes sent from AutoShift's own number (an approved AUTHENTICATION template with a
 * "Copy code" button):
 *   - sign-up phone verification: an easy 4-digit code (1010, 2255, 3443…), 3 tries, 3 sends an hour
 *   - admin sign-in and password codes: 6 random digits (see otp-codes.ts)
 *
 * Server-only. Codes are stored as a salted hash and expire after 10 minutes. A number can be
 * verified on one login only. Settings: platform_settings key 'phone_otp'. The sending number is
 * either a business connected in AutoShift or WhatsApp details entered directly (phone number id,
 * WhatsApp Business Account id and access token; the token is stored encrypted and never shown
 * again). Nothing is required until a super admin switches it on; earlier sign-ups aren't asked.
 */
import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

import { decrypt } from '@/lib/whatsapp/encryption'

export const OTP_TEMPLATE = 'autoshift_otp'
export const CODE_TTL_MIN = 10
export const MAX_ATTEMPTS = 5
export const MAX_SENDS_PER_HOUR = 5
export const RESEND_AFTER_SEC = 60
/** Sign-up codes are short and easy to type, so they get fewer tries and sends. */
export const SIGNUP_CODE_LENGTH = 4
export const SIGNUP_MAX_ATTEMPTS = 3
export const SIGNUP_MAX_SENDS_PER_HOUR = 3
const GRAPH = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION?.trim() || 'v21.0'}`

/** WhatsApp details entered directly by a super admin (instead of a business in AutoShift). */
export interface CustomSender {
  phone_number_id: string
  waba_id: string
  /** Encrypted; never sent to the browser. */
  access_token: string
  display_phone?: string | null
  verified_name?: string | null
  token_tail?: string | null
}

export interface OtpSettings {
  enabled: boolean
  /** The business whose WhatsApp number sends the codes (AutoShift's own). Ignored when custom_sender is set. */
  sender_account_id: string | null
  custom_sender?: CustomSender | null
  /** Admins enter a WhatsApp code when they sign in to the admin panel on a new device. */
  admin_2fa?: boolean
  template_name: string
  language: string
  /** People who signed up before this moment aren't asked to verify. */
  required_since: string | null
}

export const DEFAULT_OTP: OtpSettings = { enabled: false, sender_account_id: null, custom_sender: null, admin_2fa: false, template_name: OTP_TEMPLATE, language: 'en_US', required_since: null }

export async function getOtpSettings(db: SupabaseClient): Promise<OtpSettings> {
  const { data } = await db.from('platform_settings').select('value').eq('key', 'phone_otp').maybeSingle()
  return { ...DEFAULT_OTP, ...((data?.value as Partial<OtpSettings>) ?? {}) }
}

export async function saveOtpSettings(db: SupabaseClient, value: OtpSettings, userId: string): Promise<void> {
  const { error } = await db.from('platform_settings').upsert({ key: 'phone_otp', value, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw new Error(error.message)
}

/** E.164 digits only (8–15 digits, no leading zero), or null. */
export function normalisePhone(input: string): string | null {
  const d = (input ?? '').replace(/\D/g, '')
  return d.length >= 8 && d.length <= 15 && !d.startsWith('0') ? d : null
}

export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0')

/** An easy 4-digit code: ABAB (1010), AABB (2255) or ABBA (3443), with A and B different. */
export function newFancyCode(): string {
  const a = randomInt(0, 10)
  let b = randomInt(0, 9)
  if (b >= a) b += 1
  const shapes = [`${a}${b}${a}${b}`, `${a}${a}${b}${b}`, `${a}${b}${b}${a}`]
  return shapes[randomInt(0, shapes.length)]
}

/** Is a sending number set up (a business, or WhatsApp details entered directly)? */
export function hasSender(settings: OtpSettings): boolean {
  return !!(settings.custom_sender?.phone_number_id || settings.sender_account_id)
}

export function hashCode(code: string, userId: string): string {
  const pepper = process.env.ENCRYPTION_KEY ?? ''
  return createHash('sha256').update(`${pepper}:${userId}:${code}`).digest('hex')
}

export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Whether this person must verify a phone before using the app. */
export function mustVerify(settings: OtpSettings, user: { created_at?: string | null }, profile: { phone_verified_at?: string | null } | null): boolean {
  if (!settings.enabled || !hasSender(settings) || profile?.phone_verified_at) return false
  if (!settings.required_since) return true
  return !!user.created_at && user.created_at >= settings.required_since
}

export interface SenderConfig {
  phone_number_id: string
  waba_id: string | null
  access_token: string
}

/** The number that sends codes: WhatsApp details entered directly, else the chosen business's number. */
export async function senderFor(db: SupabaseClient, settings: OtpSettings): Promise<SenderConfig> {
  const custom = settings.custom_sender
  if (custom?.phone_number_id && custom.access_token) {
    return { phone_number_id: custom.phone_number_id, waba_id: custom.waba_id || null, access_token: decrypt(custom.access_token) }
  }
  if (!settings.sender_account_id) throw new Error('No sending WhatsApp number is set up')
  return senderConfig(db, settings.sender_account_id)
}

/** Checks WhatsApp details with Meta before they are saved: the number and the business account must answer. */
export async function checkSenderDetails(cfg: SenderConfig): Promise<{ display_phone: string | null; verified_name: string | null }> {
  const phone = await graph(`${cfg.phone_number_id}?fields=display_phone_number,verified_name`, cfg.access_token)
  if (cfg.waba_id) await graph(`${cfg.waba_id}?fields=id,name`, cfg.access_token)
  return { display_phone: (phone.display_phone_number as string) ?? null, verified_name: (phone.verified_name as string) ?? null }
}

export async function senderConfig(db: SupabaseClient, accountId: string): Promise<SenderConfig> {
  const { data } = await db.from('whatsapp_config').select('phone_number_id, waba_id, access_token, status').eq('account_id', accountId).maybeSingle()
  if (!data?.phone_number_id || !data.access_token) throw new Error('The verification sender has no connected WhatsApp number')
  return { phone_number_id: data.phone_number_id, waba_id: data.waba_id, access_token: decrypt(data.access_token) }
}

async function graph(path: string, token: string, init?: { method?: string; body?: unknown }) {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: init?.method ?? 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  })
  const data = (await res.json().catch(() => ({}))) as { error?: { message?: string; error_user_msg?: string } } & Record<string, unknown>
  if (!res.ok) throw new Error(data.error?.error_user_msg || data.error?.message || `Meta error ${res.status}`)
  return data
}

/** Sends the code with the approved authentication template (body + copy-code button). */
export async function sendOtp(cfg: SenderConfig, settings: OtpSettings, to: string, code: string): Promise<void> {
  await graph(`${cfg.phone_number_id}/messages`, cfg.access_token, {
    method: 'POST',
    body: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: settings.template_name,
        language: { code: settings.language },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: code }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
        ],
      },
    },
  })
}

/** The template's status at Meta (APPROVED, PENDING, REJECTED…), or null when it doesn't exist yet. */
export async function otpTemplateStatus(cfg: SenderConfig, settings: OtpSettings): Promise<{ status: string; reason: string | null } | null> {
  if (!cfg.waba_id) throw new Error('The sender has no WhatsApp Business Account id')
  const data = await graph(`${cfg.waba_id}/message_templates?name=${encodeURIComponent(settings.template_name)}&fields=name,status,language,rejected_reason`, cfg.access_token)
  const rows = (data.data as { name: string; status: string; language: string; rejected_reason?: string }[] | undefined) ?? []
  const row = rows.find((r) => r.name === settings.template_name && r.language === settings.language) ?? rows[0]
  return row ? { status: row.status, reason: row.rejected_reason && row.rejected_reason !== 'NONE' ? row.rejected_reason : null } : null
}

/** Submits Meta's standard authentication template: "<code> is your verification code", security note, expiry, copy-code button. */
export async function createOtpTemplate(cfg: SenderConfig, settings: OtpSettings): Promise<{ id: string; status: string }> {
  if (!cfg.waba_id) throw new Error('The sender has no WhatsApp Business Account id')
  const data = await graph(`${cfg.waba_id}/message_templates`, cfg.access_token, {
    method: 'POST',
    body: {
      name: settings.template_name,
      language: settings.language,
      category: 'AUTHENTICATION',
      components: [
        { type: 'BODY', add_security_recommendation: true },
        { type: 'FOOTER', code_expiration_minutes: CODE_TTL_MIN },
        { type: 'BUTTONS', buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: 'Copy code' }] },
      ],
    },
  })
  return { id: String(data.id ?? ''), status: String(data.status ?? 'PENDING') }
}
