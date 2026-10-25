/**
 * Admin sign-in for the design preview: a session cookie set after the
 * 2-step screen. It only opens the sample admin panel. The backend must
 * replace this with a server-checked admin role (Supabase auth + an
 * allow-list table) before any real data is shown here.
 */
export const ADMIN_COOKIE = 'autoshift_admin'

export function isAdminCookieSet(cookieHeader: string): boolean {
  return cookieHeader.split(';').some((part) => part.trim() === `${ADMIN_COOKIE}=1`)
}

export function setAdminCookie(on: boolean): void {
  document.cookie = on ? `${ADMIN_COOKIE}=1; path=/; SameSite=Strict` : `${ADMIN_COOKIE}=; path=/; max-age=0; SameSite=Strict`
}
