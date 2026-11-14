/**
 * Admin panel session in the browser. The cookie holds the signed device token issued by
 * /api/admin/login (see admin-token.ts); the server sets it, the middleware checks its signature,
 * and the backend client sends it with staff calls (header X-Admin-2FA).
 */
export const ADMIN_COOKIE = 'autoshift_admin'

/** The device token, or null (browser only). */
export function adminCookie(): string | null {
  if (typeof document === 'undefined') return null
  const part = document.cookie.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${ADMIN_COOKIE}=`))
  const value = part ? decodeURIComponent(part.slice(ADMIN_COOKIE.length + 1)) : ''
  return value || null
}

/** Signs this browser out of the admin panel (the device must pass the code again). */
export function setAdminCookie(on: false): void {
  if (!on) document.cookie = `${ADMIN_COOKIE}=; path=/; max-age=0; SameSite=Strict`
}
