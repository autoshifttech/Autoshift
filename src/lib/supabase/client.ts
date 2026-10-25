import { createBrowserClient } from '@supabase/ssr'
import { createClient as createPlainClient, type SupabaseClient } from '@supabase/supabase-js'
import { supabasePublicConfig } from './config'
import { createDemoFetch, demoSession, InertWebSocket } from '@/lib/demo/fetch'
import { isDemoCookieSet } from '@/lib/demo/cookie'

// Singleton instance — one client shared across the whole browser session.
// Creating multiple clients causes auth-lock contention ("Lock was released
// because another request stole it") and intermittent fetch failures.
let browserClient: SupabaseClient | undefined

/** Demo mode: no Supabase project, and the visitor chose "View demo" on /login. */
export function isDemoMode(): boolean {
  return typeof document !== 'undefined' && !supabasePublicConfig().configured && isDemoCookieSet(document.cookie)
}

export function createClient() {
  if (browserClient) return browserClient

  // Placeholder values when Supabase isn't configured yet (see ./config):
  // the client is created, and its requests fail instead of the page.
  const { url, anonKey } = supabasePublicConfig()

  if (isDemoMode()) {
    // Every Supabase request and the app's own /api/* calls are answered
    // in the tab from sample data (see src/lib/demo).
    const demoFetch = createDemoFetch(url, window.fetch.bind(window))
    window.fetch = demoFetch
    const session = JSON.stringify(demoSession())
    browserClient = createPlainClient(url, anonKey, {
      global: { fetch: demoFetch },
      auth: {
        storageKey: 'autoshift-demo-auth',
        storage: { getItem: () => session, setItem: () => {}, removeItem: () => {} },
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      realtime: { transport: InertWebSocket as never },
    })
    return browserClient
  }

  browserClient = createBrowserClient(url, anonKey)

  return browserClient
}
