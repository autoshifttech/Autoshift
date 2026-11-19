import { describe, expect, it } from 'vitest'
import { destinationAfterSignIn, NEW_USER_WINDOW_MS } from './after-sign-in'

const now = Date.parse('2026-11-19T10:00:00Z')
const fresh = new Date(now - 60_000).toISOString()
const old = new Date(now - NEW_USER_WINDOW_MS - 60_000).toISOString()

describe('where people go after signing in', () => {
  it('a brand-new sign-in without a business type goes to the setup wizard, even from /login', () => {
    expect(destinationAfterSignIn('/dashboard', { createdAt: fresh, businessType: null, isAdminType: false }, now)).toBe('/onboarding')
  })
  it('an existing person goes where they were heading', () => {
    expect(destinationAfterSignIn('/dashboard', { createdAt: old, businessType: null, isAdminType: false }, now)).toBe('/dashboard')
    expect(destinationAfterSignIn('/dashboard', { createdAt: fresh, businessType: 'retail', isAdminType: false }, now)).toBe('/dashboard')
  })
  it('invitations and the admin panel always win', () => {
    expect(destinationAfterSignIn('/join/abc', { createdAt: fresh, businessType: null, isAdminType: false }, now)).toBe('/join/abc')
    expect(destinationAfterSignIn('/admin/login?continue=1', { createdAt: fresh, businessType: null, isAdminType: false }, now)).toBe('/admin/login?continue=1')
    expect(destinationAfterSignIn('/dashboard', { createdAt: fresh, businessType: null, isAdminType: true }, now)).toBe('/dashboard')
  })
  it('a missing creation time is treated as existing', () => {
    expect(destinationAfterSignIn('/dashboard', { createdAt: null, businessType: null, isAdminType: false }, now)).toBe('/dashboard')
  })
})
