import { supabaseAdmin } from '@/lib/ai/admin-client'

/** The login with this email (profiles hold the sign-in email), or null. */
export async function userIdForEmail(email: string): Promise<string | null> {
  const clean = email.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean) || clean.length > 200) return null
  const { data } = await supabaseAdmin().from('profiles').select('user_id, email').ilike('email', clean.replace(/[%_\\]/g, (c) => `\\${c}`)).limit(2)
  const exact = (data ?? []).filter((p) => (p.email ?? '').toLowerCase() === clean)
  return exact.length === 1 ? exact[0].user_id : null
}
