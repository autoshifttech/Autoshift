/**
 * Meta WhatsApp Embedded Signup (JS SDK).
 *
 * FB.login(config_id, response_type=code) returns a short-lived authorization code, while the
 * popup posts a `WA_EMBEDDED_SIGNUP` message to this window with the WABA ID and phone number ID.
 * Both are sent to the backend, which exchanges the code server-side.
 */
import { env } from '../../lib/env'

export type OnboardingType = 'cloud' | 'coexistence'

export type SignupMessage =
  | { kind: 'finish'; wabaId: string; phoneNumberId: string; onboardingType: OnboardingType }
  | { kind: 'cancel'; step: string | null }
  | { kind: 'error'; message: string }

export type SignupResult = {
  code: string
  wabaId: string
  phoneNumberId: string
  onboardingType: OnboardingType
}

export class SignupAborted extends Error {}

const SDK_SRC = 'https://connect.facebook.net/en_US/sdk.js'
const SESSION_INFO_WAIT_MS = 15_000

export function isFacebookOrigin(origin: string): boolean {
  try {
    const { protocol, hostname } = new URL(origin)
    return protocol === 'https:' && (hostname === 'facebook.com' || hostname.endsWith('.facebook.com'))
  } catch {
    return false
  }
}

/** Parse a window `message` event; returns null for anything that is not an Embedded Signup event. */
export function parseSignupMessage(origin: string, data: unknown): SignupMessage | null {
  if (!isFacebookOrigin(origin)) return null
  let payload: unknown = data
  if (typeof data === 'string') {
    try {
      payload = JSON.parse(data)
    } catch {
      return null
    }
  }
  if (!payload || typeof payload !== 'object') return null
  const { type, event, data: details = {} } = payload as {
    type?: string
    event?: string
    data?: Record<string, unknown>
  }
  if (type !== 'WA_EMBEDDED_SIGNUP') return null

  const wabaId = details.waba_id ? String(details.waba_id) : ''
  const phoneNumberId = details.phone_number_id ? String(details.phone_number_id) : ''
  switch (event) {
    case 'FINISH':
    case 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING':
      if (!wabaId || !phoneNumberId) {
        return { kind: 'error', message: 'Meta did not return a WhatsApp Business Account and phone number.' }
      }
      return {
        kind: 'finish',
        wabaId,
        phoneNumberId,
        onboardingType: event === 'FINISH' ? 'cloud' : 'coexistence',
      }
    case 'FINISH_ONLY_WABA':
      return { kind: 'error', message: 'Signup finished without a phone number. Run it again and add a number.' }
    case 'CANCEL':
      return { kind: 'cancel', step: details.current_step ? String(details.current_step) : null }
    case 'ERROR':
      return { kind: 'error', message: String(details.error_message || 'Meta reported an error during signup.') }
    default:
      return null
  }
}

let sdkPromise: Promise<FacebookSdk> | null = null

export function loadFacebookSdk(): Promise<FacebookSdk> {
  if (window.FB) return Promise.resolve(window.FB)
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise<FacebookSdk>((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB!.init({ appId: env.metaAppId, autoLogAppEvents: true, xfbml: false, version: env.metaGraphVersion })
      resolve(window.FB!)
    }
    const script = document.createElement('script')
    script.src = SDK_SRC
    script.async = true
    script.defer = true
    script.crossOrigin = 'anonymous'
    script.onerror = () => {
      sdkPromise = null
      script.remove()
      reject(new Error('Could not load the Facebook SDK. Disable blockers for this page and try again.'))
    }
    document.body.appendChild(script)
  })
  return sdkPromise
}

/** Opens the Embedded Signup popup; resolves once both the code and the session info arrived. */
export async function launchEmbeddedSignup(options: { coexistence: boolean }): Promise<SignupResult> {
  const FB = await loadFacebookSdk()

  return new Promise<SignupResult>((resolve, reject) => {
    let code: string | null = null
    let session: Extract<SignupMessage, { kind: 'finish' }> | null = null
    let timer: number | undefined

    const cleanup = () => {
      window.removeEventListener('message', onMessage)
      window.clearTimeout(timer)
    }
    const settle = () => {
      if (code && session) {
        cleanup()
        resolve({ code, wabaId: session.wabaId, phoneNumberId: session.phoneNumberId, onboardingType: session.onboardingType })
      }
    }
    const fail = (error: Error) => {
      cleanup()
      reject(error)
    }

    function onMessage(event: MessageEvent) {
      const message = parseSignupMessage(event.origin, event.data)
      if (!message) return
      if (message.kind === 'finish') {
        session = message
        settle()
      } else if (message.kind === 'cancel') {
        fail(new SignupAborted(message.step ? `Signup was closed at step “${message.step}”.` : 'Signup was closed.'))
      } else {
        fail(new Error(message.message))
      }
    }

    window.addEventListener('message', onMessage)

    // The SDK requires a synchronous (non-async) callback.
    FB.login(
      (response) => {
        const authCode = response.authResponse?.code
        if (!authCode) {
          fail(new SignupAborted('Signup was cancelled before Meta returned an authorization code.'))
          return
        }
        code = authCode
        // The code expires quickly; don't wait long for the session-info message.
        timer = window.setTimeout(
          () => fail(new Error('Meta did not report which WhatsApp account was connected. Please try again.')),
          SESSION_INFO_WAIT_MS,
        )
        settle()
      },
      {
        config_id: env.metaConfigId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          sessionInfoVersion: '3',
          ...(options.coexistence ? { featureType: 'whatsapp_business_app_onboarding' } : {}),
        },
      },
    )
  })
}
