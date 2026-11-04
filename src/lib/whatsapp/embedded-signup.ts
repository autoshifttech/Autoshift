/**
 * WhatsApp Embedded Signup, server side. Meta's popup gives the browser a one-time code plus the ids of
 * the WhatsApp Business Account (WABA) and phone number the business picked. Here we:
 *   1. swap the code for the business's token (needs the app secret, so never in the browser),
 *   2. check the number really belongs to that WABA and isn't linked to another AutoShift business,
 *   3. subscribe the WABA to our app (so its messages reach our webhook),
 *   4. register the number for the Cloud API with a fresh two-step PIN,
 *   5. save the connection (tokens and PIN encrypted).
 * Every outside call is passed in, so each step and failure is testable without Meta.
 */
import type { MetaConnectStep } from './meta-error-explain'

export interface EmbeddedSignupInput {
  code: string
  wabaId: string
  phoneNumberId: string
}

export interface EmbeddedSignupDeps {
  exchangeCode(code: string): Promise<string>
  listWabaNumbers(wabaId: string, token: string): Promise<{ id: string }[]>
  readNumber(phoneNumberId: string, token: string): Promise<{ display_phone_number?: string; verified_name?: string }>
  subscribeWaba(wabaId: string, token: string): Promise<void>
  registerNumber(phoneNumberId: string, token: string, pin: string): Promise<void>
  linkedToAnotherBusiness(phoneNumberId: string): Promise<boolean>
  save(row: { phoneNumberId: string; wabaId: string; token: string; pin: string; registered: boolean; registrationError: string | null }): Promise<void>
  /** The token AutoShift keeps using: the platform's own system-user token when set, else the business's. */
  operatingToken(businessToken: string): string
  randomPin(): string
}

export type EmbeddedSignupResult =
  | { ok: true; displayPhoneNumber: string; verifiedName: string; registered: boolean; registrationError: string | null }
  | { ok: false; step: MetaConnectStep | 'conflict' | 'input'; error: unknown; status: number }

const NUMERIC = /^\d{5,20}$/

export async function completeEmbeddedSignup(deps: EmbeddedSignupDeps, input: EmbeddedSignupInput): Promise<EmbeddedSignupResult> {
  if (!input.code || !NUMERIC.test(input.wabaId) || !NUMERIC.test(input.phoneNumberId)) {
    return { ok: false, step: 'input', error: new Error('The sign-in did not return a WhatsApp account and number'), status: 400 }
  }

  let businessToken: string
  try {
    businessToken = await deps.exchangeCode(input.code)
  } catch (error) {
    return { ok: false, step: 'exchange_code', error, status: 502 }
  }
  const token = deps.operatingToken(businessToken)

  try {
    const numbers = await deps.listWabaNumbers(input.wabaId, token)
    if (!numbers.some((n) => n.id === input.phoneNumberId)) {
      return { ok: false, step: 'waba_phone_numbers', error: new Error('That number is not in the WhatsApp Business Account you picked'), status: 400 }
    }
  } catch (error) {
    return { ok: false, step: 'waba_phone_numbers', error, status: 502 }
  }

  if (await deps.linkedToAnotherBusiness(input.phoneNumberId)) {
    return { ok: false, step: 'conflict', error: new Error('This WhatsApp number is already connected to another AutoShift business'), status: 409 }
  }

  let info: { display_phone_number?: string; verified_name?: string }
  try {
    info = await deps.readNumber(input.phoneNumberId, token)
  } catch (error) {
    return { ok: false, step: 'verify_number', error, status: 502 }
  }

  try {
    await deps.subscribeWaba(input.wabaId, token)
  } catch (error) {
    return { ok: false, step: 'subscribe_waba', error, status: 502 }
  }

  // Registration can fail for reasons the business can fix later (e.g. a PIN they set before);
  // the connection is still saved so they can retry from Settings.
  const pin = deps.randomPin()
  let registrationError: string | null = null
  try {
    await deps.registerNumber(input.phoneNumberId, token, pin)
  } catch (error) {
    registrationError = error instanceof Error ? error.message : String(error)
  }

  await deps.save({ phoneNumberId: input.phoneNumberId, wabaId: input.wabaId, token, pin, registered: registrationError === null, registrationError })
  return { ok: true, displayPhoneNumber: info.display_phone_number ?? '', verifiedName: info.verified_name ?? '', registered: registrationError === null, registrationError }
}
