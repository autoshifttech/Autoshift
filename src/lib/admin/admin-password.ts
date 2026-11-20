// Username + password sign-in for AutoShift staff (the admin panel only; businesses sign in without a
// password). A username belongs to one admin (platform_admins.username); an email works too. The
// WhatsApp code step after it is unchanged.

export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/

/** At least 10 characters with a letter and a number. Returns an error key, or null when fine. */
export function passwordProblem(password: string): 'too_short' | 'too_simple' | 'too_long' | null {
  if (password.length < 10) return 'too_short'
  if (password.length > 72) return 'too_long'
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'too_simple'
  return null
}

export const cleanLogin = (login: string) => login.trim().toLowerCase().slice(0, 254)
