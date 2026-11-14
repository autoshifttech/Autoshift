/**
 * The admin panel's device token: proof that this browser passed admin sign-in (password, then a
 * WhatsApp code when admin sign-in codes are on). Valid for 30 days on that device.
 *
 * Format: "<user id>.<expiry unix seconds>.<signature>", the signature being base64url
 * HMAC-SHA256(AUTOSHIFT_INTERNAL_SECRET, "admin2fa:<user id>.<expiry>"). The backend checks the
 * same token (header X-Admin-2FA) before any staff route, so the panel's data can't be reached
 * with a password alone. Web Crypto only, so it also runs in middleware.
 */
export const ADMIN_TOKEN_COOKIE = 'autoshift_admin'
export const ADMIN_TOKEN_DAYS = 30

function secret(): string {
  return process.env.AUTOSHIFT_INTERNAL_SECRET?.trim() ?? ''
}

function b64url(bytes: ArrayBuffer): string {
  let bin = ''
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`admin2fa:${payload}`)))
}

export async function makeAdminToken(userId: string, days = ADMIN_TOKEN_DAYS): Promise<string> {
  if (!secret()) throw new Error('AUTOSHIFT_INTERNAL_SECRET is not set')
  const exp = Math.floor(Date.now() / 1000) + days * 86400
  const payload = `${userId}.${exp}`
  return `${payload}.${await sign(payload)}`
}

/** The user id the token was issued to, when it is genuine and not expired; else null. */
export async function readAdminToken(token: string | null | undefined): Promise<string | null> {
  if (!token || !secret()) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [userId, expRaw, sig] = parts
  const exp = Number(expRaw)
  if (!userId || !Number.isFinite(exp) || exp * 1000 < Date.now()) return null
  const want = await sign(`${userId}.${expRaw}`)
  if (want.length !== sig.length) return null
  let diff = 0
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i)
  return diff === 0 ? userId : null
}

export async function verifyAdminToken(token: string | null | undefined, userId: string): Promise<boolean> {
  return (await readAdminToken(token)) === userId
}

/** The token from the request cookies (server components and route handlers). */
export async function adminTokenFromCookies(): Promise<string | null> {
  const { cookies } = await import('next/headers')
  return (await cookies()).get(ADMIN_TOKEN_COOKIE)?.value ?? null
}
