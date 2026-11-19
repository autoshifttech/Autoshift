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

  it('no screen signs in or signs up with a password', () => {
    const offenders = src.filter((f) => /signInWithPassword|auth\.signUp\(|updateUser\(\s*\{\s*password/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
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
