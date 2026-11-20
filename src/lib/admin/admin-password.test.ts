import { describe, expect, it } from 'vitest'
import { USERNAME_RE, cleanLogin, passwordProblem } from './admin-password'

describe('admin username and password rules', () => {
  it('checks usernames', () => {
    for (const ok of ['asha', 'ops.team', 'admin_1', 'a-b-c']) expect(USERNAME_RE.test(ok)).toBe(true)
    for (const bad of ['ab', 'Asha', '-asha', 'has space', 'a@b', 'x'.repeat(33)]) expect(USERNAME_RE.test(bad)).toBe(false)
  })
  it('checks passwords', () => {
    expect(passwordProblem('short1')).toBe('too_short')
    expect(passwordProblem('onlyletters')).toBe('too_simple')
    expect(passwordProblem('1234567890')).toBe('too_simple')
    expect(passwordProblem('x1'.repeat(40))).toBe('too_long')
    expect(passwordProblem('autoshift2026')).toBeNull()
  })
  it('cleans the login field', () => {
    expect(cleanLogin('  Admin@AutoShift.in ')).toBe('admin@autoshift.in')
  })
})
