import { randomInt } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

import { requireRole, toErrorResponse, UnauthorizedError, ForbiddenError } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { encrypt } from '@/lib/whatsapp/encryption'
import { completeEmbeddedSignup } from '@/lib/whatsapp/embedded-signup'
import { explainMetaError, metaErrorPayload, type MetaConnectStep } from '@/lib/whatsapp/meta-error-explain'
import { exchangeEmbeddedSignupCode, listWabaPhoneNumbers, registerPhoneNumber, subscribeWabaToApp, verifyPhoneNumber } from '@/lib/whatsapp/meta-api'

function supabaseAdmin() {
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** The app's own id and secret. META_APP_SECRET may list several apps' secrets; the first is this app's. */
function appCredentials(): { appId: string; appSecret: string } | null {
  const appId = (process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID || '').trim()
  const appSecret = (process.env.META_APP_SECRET || '').split(',')[0]?.trim() ?? ''
  return appId && appSecret ? { appId, appSecret } : null
}

/**
 * POST /api/whatsapp/embedded-signup
 * Body: { code, waba_id, phone_number_id } from Meta's Embedded Signup popup.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')
    const limit = checkRateLimit(`whatsapp-admin:${userId}`, RATE_LIMITS.whatsappAdmin)
    if (!limit.success) return rateLimitResponse(limit)

    const creds = appCredentials()
    if (!creds) {
      return NextResponse.json({ error: 'WhatsApp sign-up is not set up on this site yet (META_APP_ID and META_APP_SECRET).' }, { status: 503 })
    }
    const body = (await request.json().catch(() => null)) as { code?: unknown; waba_id?: unknown; phone_number_id?: unknown } | null
    const input = { code: String(body?.code ?? ''), wabaId: String(body?.waba_id ?? ''), phoneNumberId: String(body?.phone_number_id ?? '') }
    const systemUserToken = process.env.META_SYSTEM_USER_TOKEN?.trim()

    const result = await completeEmbeddedSignup(
      {
        exchangeCode: (code) => exchangeEmbeddedSignupCode({ code, ...creds }),
        listWabaNumbers: (wabaId, accessToken) => listWabaPhoneNumbers({ wabaId, accessToken }),
        readNumber: (phoneNumberId, accessToken) => verifyPhoneNumber({ phoneNumberId, accessToken }),
        subscribeWaba: (wabaId, accessToken) => subscribeWabaToApp({ wabaId, accessToken }),
        registerNumber: async (phoneNumberId, accessToken, pin) => {
          await registerPhoneNumber({ phoneNumberId, accessToken, pin })
        },
        linkedToAnotherBusiness: async (phoneNumberId) => {
          const { data } = await supabaseAdmin().from('whatsapp_config').select('account_id').eq('phone_number_id', phoneNumberId).neq('account_id', accountId).maybeSingle()
          return Boolean(data)
        },
        operatingToken: (businessToken) => systemUserToken || businessToken,
        randomPin: () => String(randomInt(0, 1_000_000)).padStart(6, '0'),
        save: async (row) => {
          const now = new Date().toISOString()
          const fields = {
            phone_number_id: row.phoneNumberId,
            waba_id: row.wabaId,
            access_token: encrypt(row.token),
            two_step_pin: encrypt(row.pin),
            onboarded_via: 'embedded_signup',
            status: row.registered ? 'connected' : 'disconnected',
            connected_at: row.registered ? now : null,
            registered_at: row.registered ? now : null,
            subscribed_apps_at: now,
            last_registration_error: row.registrationError,
            updated_at: now,
          }
          const { data: existing } = await supabase.from('whatsapp_config').select('id').eq('account_id', accountId).maybeSingle()
          const { error } = existing
            ? await supabase.from('whatsapp_config').update(fields).eq('account_id', accountId)
            : await supabase.from('whatsapp_config').insert({ account_id: accountId, user_id: userId, ...fields })
          if (error) throw new Error(`Could not save the WhatsApp connection: ${error.message}`)
        },
      },
      input,
    )

    if (!result.ok) {
      if (result.step === 'conflict' || result.step === 'input') {
        return NextResponse.json({ error: result.error instanceof Error ? result.error.message : 'Sign-up failed' }, { status: result.status })
      }
      const explained = explainMetaError(result.error, result.step as MetaConnectStep, { phoneNumberId: input.phoneNumberId, wabaId: input.wabaId })
      console.error('[embedded-signup] failed at', result.step, explained.metaMessage)
      return NextResponse.json({ error: explained.summary, meta: metaErrorPayload(explained) }, { status: result.status })
    }
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) return toErrorResponse(error)
    console.error('[embedded-signup] error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Sign-up failed' }, { status: 500 })
  }
}
