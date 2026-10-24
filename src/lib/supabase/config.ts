/**
 * Supabase connection settings, with a "not configured" mode.
 *
 * The public website, free tools and release notes must keep working on a
 * deployment that has no Supabase project yet. Instead of crashing the build
 * (pages are prerendered) or every request (middleware), clients are created
 * against a placeholder that never resolves, and the auth pages explain that
 * sign-in isn't connected.
 *
 * Values are read on every call (not at module load) so tests can set them;
 * `process.env.NEXT_PUBLIC_*` is still inlined into the browser bundle.
 */

const PLACEHOLDER_URL = 'https://supabase-not-configured.invalid'
const PLACEHOLDER_KEY = 'supabase-not-configured'

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

/** Real-looking values: present, a valid http(s) URL, not a REPLACE_ placeholder. */
export function isSupabaseConfigured(
  url: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
): boolean {
  const u = url?.trim() ?? ''
  const k = anonKey?.trim() ?? ''
  return isHttpUrl(u) && k.length > 0 && !/^REPLACE_/i.test(u) && !/^REPLACE_/i.test(k)
}

/** URL and anon key to hand to a Supabase client; placeholders when not configured. */
export function supabasePublicConfig(): { url: string; anonKey: string; configured: boolean } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (isSupabaseConfigured(url, anonKey)) return { url: url!, anonKey: anonKey!, configured: true }
  return { url: PLACEHOLDER_URL, anonKey: PLACEHOLDER_KEY, configured: false }
}
