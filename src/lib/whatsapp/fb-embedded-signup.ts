/**
 * Meta's WhatsApp Embedded Signup popup in the browser. Needs NEXT_PUBLIC_META_APP_ID and
 * NEXT_PUBLIC_META_ES_CONFIG_ID (both public; the app secret stays on the server).
 *
 * Meta sends two things back: FB.login's callback carries a one-time `code`, and a postMessage from
 * facebook.com carries the WhatsApp Business Account and phone-number ids (or where the user stopped).
 * We wait for both, then the server finishes the connection.
 */

export interface EmbeddedSignupConfig {
  appId: string
  configId: string
  version: string
}

export function embeddedSignupConfig(): EmbeddedSignupConfig | null {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID?.trim()
  const configId = process.env.NEXT_PUBLIC_META_ES_CONFIG_ID?.trim()
  if (!appId || !configId) return null
  return { appId, configId, version: process.env.NEXT_PUBLIC_META_GRAPH_VERSION?.trim() || 'v21.0' }
}

export type SignupMessage =
  | { kind: 'finish'; wabaId: string; phoneNumberId: string }
  | { kind: 'finish_without_number'; wabaId: string }
  | { kind: 'cancel'; step: string }
  | { kind: 'error'; message: string }

/** Reads Meta's WA_EMBEDDED_SIGNUP message; ignores anything not from facebook.com. */
export function parseSignupMessage(origin: string, raw: unknown): SignupMessage | null {
  let host: string
  try {
    host = new URL(origin).hostname
  } catch {
    return null
  }
  if (host !== 'facebook.com' && !host.endsWith('.facebook.com')) return null
  let msg: { type?: string; event?: string; data?: Record<string, string> }
  try {
    msg = typeof raw === 'string' ? JSON.parse(raw) : (raw as typeof msg)
  } catch {
    return null
  }
  if (!msg || msg.type !== 'WA_EMBEDDED_SIGNUP') return null
  const d = msg.data ?? {}
  switch (msg.event) {
    case 'FINISH':
      return d.waba_id && d.phone_number_id ? { kind: 'finish', wabaId: d.waba_id, phoneNumberId: d.phone_number_id } : { kind: 'error', message: 'Meta did not say which number was picked' }
    case 'FINISH_ONLY_WABA':
      return { kind: 'finish_without_number', wabaId: d.waba_id ?? '' }
    case 'CANCEL':
      return { kind: 'cancel', step: d.current_step ?? '' }
    case 'ERROR':
      return { kind: 'error', message: d.error_message || 'Meta reported an error during sign-up' }
    default:
      return null
  }
}

interface FacebookSdk {
  init(opts: Record<string, unknown>): void
  login(cb: (r: { authResponse?: { code?: string } | null; status?: string }) => void, opts: Record<string, unknown>): void
}
declare global {
  interface Window {
    FB?: FacebookSdk
    fbAsyncInit?: () => void
  }
}

let sdkReady: Promise<FacebookSdk> | null = null

function loadSdk(cfg: EmbeddedSignupConfig): Promise<FacebookSdk> {
  sdkReady ??= new Promise((resolve, reject) => {
    if (window.FB) {
      window.FB.init({ appId: cfg.appId, autoLogAppEvents: true, xfbml: false, version: cfg.version })
      return resolve(window.FB)
    }
    window.fbAsyncInit = () => {
      window.FB!.init({ appId: cfg.appId, autoLogAppEvents: true, xfbml: false, version: cfg.version })
      resolve(window.FB!)
    }
    const el = document.createElement('script')
    el.src = 'https://connect.facebook.net/en_US/sdk.js'
    el.async = true
    el.crossOrigin = 'anonymous'
    el.onerror = () => {
      sdkReady = null
      reject(new Error('Could not load Facebook. Check your connection or ad blocker.'))
    }
    document.body.appendChild(el)
  })
  return sdkReady
}

export type PopupResult =
  | { status: 'done'; code: string; wabaId: string; phoneNumberId: string }
  | { status: 'cancelled'; step: string }
  | { status: 'error'; message: string }

/** Opens Meta's popup and resolves once we have the code and the chosen number (or the user stopped). */
export async function openEmbeddedSignup(cfg: EmbeddedSignupConfig): Promise<PopupResult> {
  const FB = await loadSdk(cfg)
  return new Promise<PopupResult>((resolve) => {
    let code: string | null = null
    let ids: { wabaId: string; phoneNumberId: string } | null = null
    let settled = false
    const finish = (r: PopupResult) => {
      if (settled) return
      settled = true
      window.removeEventListener('message', onMessage)
      resolve(r)
    }
    const maybeDone = () => {
      if (code && ids) finish({ status: 'done', code, ...ids })
    }
    function onMessage(event: MessageEvent) {
      const m = parseSignupMessage(event.origin, event.data)
      if (!m) return
      if (m.kind === 'finish') {
        ids = { wabaId: m.wabaId, phoneNumberId: m.phoneNumberId }
        maybeDone()
      } else if (m.kind === 'cancel') finish({ status: 'cancelled', step: m.step })
      else if (m.kind === 'error') finish({ status: 'error', message: m.message })
      else finish({ status: 'error', message: 'A WhatsApp account was set up but no phone number was added. Run sign-up again and add a number.' })
    }
    window.addEventListener('message', onMessage)
    // FB.login wants a plain (non-async) callback.
    FB.login(
      (response) => {
        const c = response.authResponse?.code
        if (c) {
          code = c
          maybeDone()
          // The ids message can arrive just after the callback; give it a moment.
          window.setTimeout(() => !settled && !ids && finish({ status: 'error', message: 'Meta did not say which number was picked. Try again.' }), 15000)
        } else {
          finish({ status: 'cancelled', step: '' })
        }
      },
      { config_id: cfg.configId, response_type: 'code', override_default_response_type: true, extras: { setup: {}, featureType: '', sessionInfoVersion: '3' } },
    )
  })
}

export interface SignupDone {
  displayPhoneNumber: string
  verifiedName: string
  registered: boolean
  registrationError: string | null
}

/** Sends the popup's result to our server, which finishes the connection with Meta. */
export async function finishOnServer(r: { code: string; wabaId: string; phoneNumberId: string }): Promise<SignupDone> {
  const res = await fetch('/api/whatsapp/embedded-signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: r.code, waba_id: r.wabaId, phone_number_id: r.phoneNumberId }),
  })
  const body = (await res.json().catch(() => ({}))) as Partial<SignupDone> & { error?: string }
  if (!res.ok) throw new Error(body.error || 'Could not finish connecting WhatsApp')
  return { displayPhoneNumber: body.displayPhoneNumber ?? '', verifiedName: body.verifiedName ?? '', registered: !!body.registered, registrationError: body.registrationError ?? null }
}
