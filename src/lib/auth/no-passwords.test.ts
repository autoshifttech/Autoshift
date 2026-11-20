import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|jsx?)$/.test(n) && !/\.test\./.test(n) ? [p] : []
  })
}

describe('sign-in without passwords', () => {
  const src = files(join(process.cwd(), 'src'))

  it('no business screen signs in or signs up with a password', () => {
    // Only AutoShift staff may use a password, on the admin login (then the WhatsApp code).
    const offenders = src.filter((f) => /signInWithPassword|auth\.signUp\(|updateUser\(\s*\{\s*password/.test(readFileSync(f, 'utf8')))
    expect(offenders.map((f) => f.slice(process.cwd().length + 1))).toEqual(['src/app/api/admin/login/password/route.ts'])
  })

  it('the admin password routes are staff-only', () => {
    const signIn = readFileSync(join(process.cwd(), 'src/app/api/admin/login/password/route.ts'), 'utf8')
    expect(signIn).toContain("from('platform_admins')")
    expect(signIn).toContain('signOut()')
    const account = readFileSync(join(process.cwd(), 'src/app/api/admin/account/route.ts'), 'utf8')
    expect(account).toContain('verifyAdminToken')
  })

  it('the password pages are gone', () => {
    expect(existsSync(join(process.cwd(), 'src/app/(auth)/forgot-password'))).toBe(false)
    expect(existsSync(join(process.cwd(), 'src/app/(auth)/reset-password'))).toBe(false)
  })

  it('login, sign-up and the admin login offer Google', () => {
    const panel = readFileSync(join(process.cwd(), 'src/components/auth/sign-in-panel.tsx'), 'utf8')
    expect(panel).toContain("provider: \"google\"")
    expect(panel).toContain('signInWithOtp')
    for (const page of ['src/app/(auth)/login/page.tsx', 'src/app/(auth)/signup/page.tsx']) {
      expect(readFileSync(join(process.cwd(), page), 'utf8')).toContain('<SignInPanel')
    }
    expect(readFileSync(join(process.cwd(), 'src/components/admin/admin-login.tsx'), 'utf8')).toContain('provider: "google"')
  })
})
