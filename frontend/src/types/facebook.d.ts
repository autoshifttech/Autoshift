/** Minimal typings for the parts of the Meta JS SDK used by Embedded Signup. */
interface FacebookLoginResponse {
  status: 'connected' | 'not_authorized' | 'unknown'
  authResponse?: { code?: string; accessToken?: string } | null
}

interface FacebookLoginOptions {
  config_id: string
  response_type: 'code'
  override_default_response_type: boolean
  extras?: Record<string, unknown>
}

interface FacebookSdk {
  init(params: { appId: string; autoLogAppEvents?: boolean; xfbml?: boolean; version: string }): void
  login(callback: (response: FacebookLoginResponse) => void, options: FacebookLoginOptions): void
}

interface Window {
  FB?: FacebookSdk
  fbAsyncInit?: () => void
}
