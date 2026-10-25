/** The demo-mode switch: a session cookie set by "View demo" on /login (kept tiny for middleware). */
export const DEMO_COOKIE = 'autoshift_demo'

export function isDemoCookieSet(cookieHeader: string): boolean {
  return cookieHeader.split(';').some((part) => part.trim() === `${DEMO_COOKIE}=1`)
}

/** Turns demo mode on or off for this browser. */
export function setDemoCookie(on: boolean): void {
  document.cookie = on ? `${DEMO_COOKIE}=1; path=/; SameSite=Lax` : `${DEMO_COOKIE}=; path=/; max-age=0; SameSite=Lax`
}
