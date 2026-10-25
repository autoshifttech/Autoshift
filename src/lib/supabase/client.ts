import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabasePublicConfig } from './config'

// Singleton instance — one client shared across the whole browser session.
// Creating multiple clients causes auth-lock contention ("Lock was released
// because another request stole it") and intermittent fetch failures.
let browserClient: SupabaseClient | undefined

export function createClient() {
  if (browserClient) return browserClient

  // Placeholder values when Supabase isn't configured yet (see ./config):
  // the client is created, and its requests fail instead of the page.
  const { url, anonKey } = supabasePublicConfig()
  browserClient = createBrowserClient(url, anonKey)

  return browserClient
}
