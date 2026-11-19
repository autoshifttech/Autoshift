// ============================================================
// Where someone goes right after signing in (Google or email).
//
// A brand-new person who signed in from /login (not /signup) used to land
// straight on the dashboard and skip setting up their business. Here a new
// login whose business has no type yet is sent to the setup wizard instead,
// whichever page and sign-in method they started from.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

/** A login created this recently counts as a new sign-up. */
export const NEW_USER_WINDOW_MS = 30 * 60 * 1000
export const ONBOARDING_PATH = '/onboarding'

export interface SignedInFacts {
  createdAt: string | null | undefined
  businessType: string | null | undefined
  isAdminType: boolean
}

export function destinationAfterSignIn(next: string, facts: SignedInFacts, now = Date.now()): string {
  // An invitation or the admin panel always wins: those people join or run an existing workspace.
  if (next.startsWith('/join/') || next.startsWith('/admin') || facts.isAdminType) return next
  const created = facts.createdAt ? Date.parse(facts.createdAt) : NaN
  const isNew = Number.isFinite(created) && now - created < NEW_USER_WINDOW_MS
  if (isNew && !facts.businessType && next !== ONBOARDING_PATH) return ONBOARDING_PATH
  return next
}

/** Reads what the decision needs for the signed-in person. Never throws: falls back to `next`. */
export async function afterSignIn(supabase: SupabaseClient, next: string): Promise<string> {
  try {
    const { data } = await supabase.auth.getUser()
    const user = data.user
    if (!user) return next
    const { data: profile } = await supabase.from('profiles').select('account_id, account_type').eq('user_id', user.id).maybeSingle()
    let businessType: string | null = null
    if (profile?.account_id) {
      const { data: acct } = await supabase.from('accounts').select('business_type').eq('id', profile.account_id).maybeSingle()
      businessType = (acct?.business_type as string | null) ?? null
    }
    return destinationAfterSignIn(next, {
      createdAt: user.created_at,
      businessType,
      isAdminType: profile?.account_type === 'admin' || user.app_metadata?.account_type === 'admin',
    })
  } catch (err) {
    console.warn('[after sign-in] falling back to next', err)
    return next
  }
}
