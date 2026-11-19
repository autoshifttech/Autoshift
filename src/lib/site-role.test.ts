import { describe, expect, it } from 'vitest'
import { siteRole, siteRoleRedirect } from './site-role'

const urls = { adminUrl: 'https://autoshift-admin.onrender.com', appUrl: 'https://autoshift-web.onrender.com/' }

describe('separate admin and business links', () => {
  it('one link for everything when no role is set', () => {
    expect(siteRole(undefined)).toBeNull()
    expect(siteRole('other')).toBeNull()
    expect(siteRoleRedirect(null, '/admin', '', urls)).toBeNull()
    expect(siteRoleRedirect(null, '/dashboard', '', urls)).toBeNull()
  })

  it('the admin link opens the admin panel and sends business pages to the app', () => {
    expect(siteRoleRedirect('admin', '/', '', urls)).toBe('/admin')
    expect(siteRoleRedirect('admin', '/admin/businesses', '', urls)).toBeNull()
    expect(siteRoleRedirect('admin', '/admin/login', '', urls)).toBeNull()
    expect(siteRoleRedirect('admin', '/dashboard', '?x=1', urls)).toBe('https://autoshift-web.onrender.com/dashboard?x=1')
    expect(siteRoleRedirect('admin', '/login', '', urls)).toBe('https://autoshift-web.onrender.com/login')
    expect(siteRoleRedirect('admin', '/pricing', '', { adminUrl: null, appUrl: null })).toBe('/admin')
  })

  it('the business link sends admin pages to the admin link', () => {
    expect(siteRoleRedirect('business', '/admin', '', urls)).toBe('https://autoshift-admin.onrender.com/admin')
    expect(siteRoleRedirect('business', '/admin/login', '?next=%2Fadmin', urls)).toBe('https://autoshift-admin.onrender.com/admin/login?next=%2Fadmin')
    expect(siteRoleRedirect('business', '/admin', '', { adminUrl: null, appUrl: null })).toBe('/dashboard')
    expect(siteRoleRedirect('business', '/dashboard', '', urls)).toBeNull()
    expect(siteRoleRedirect('business', '/', '', urls)).toBeNull()
  })

  it('APIs, webhooks, sign-in callbacks and files work on both links', () => {
    for (const role of ['admin', 'business'] as const) {
      for (const p of ['/api/whatsapp/webhook', '/api/admin/login', '/auth/callback', '/_next/static/x.js', '/site/index.html', '/logo.png']) {
        expect(siteRoleRedirect(role, p, '', urls), `${role} ${p}`).toBeNull()
      }
    }
  })
})
