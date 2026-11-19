// ============================================================
// Separate links for the admin panel and the business app.
//
// The same code runs as two Render services; SITE_ROLE says which one this is:
//   SITE_ROLE=admin    → only the admin panel (/ opens it). Business pages go to APP_SITE_URL.
//   SITE_ROLE=business → the website and the business app. /admin pages go to ADMIN_SITE_URL.
//   unset              → everything on one link (as before).
// APIs, webhooks, sign-in callbacks and static files work on both, so nothing that calls in breaks.
// ============================================================

export type SiteRole = 'admin' | 'business'

const SHARED = ['/api/', '/auth/', '/_next/', '/favicon', '/robots.txt', '/sitemap', '/manifest', '/site/', '/icons/', '/images/']

export function siteRole(value: string | undefined | null): SiteRole | null {
  return value === 'admin' || value === 'business' ? value : null
}

function isAdminPage(path: string): boolean {
  return path === '/admin' || path.startsWith('/admin/')
}

function isShared(path: string): boolean {
  // Files with an extension (images, fonts, the static website) are served on both links.
  return SHARED.some((p) => path.startsWith(p)) || /\.[a-z0-9]{2,5}$/i.test(path)
}

function join(base: string, path: string, search: string): string {
  return `${base.replace(/\/+$/, '')}${path}${search}`
}

/**
 * Where to send this request instead, or null to serve it here.
 * `adminUrl` / `appUrl` are the other service's address (no trailing slash needed).
 */
export function siteRoleRedirect(role: SiteRole | null, path: string, search: string, opts: { adminUrl?: string | null; appUrl?: string | null }): string | null {
  if (!role || isShared(path)) return null
  if (role === 'admin') {
    if (path === '/') return '/admin'
    if (isAdminPage(path)) return null
    // A business page opened on the admin link: send it to the business app.
    return opts.appUrl ? join(opts.appUrl, path, search) : '/admin'
  }
  // Business link: the admin panel lives on its own link.
  if (isAdminPage(path)) return opts.adminUrl ? join(opts.adminUrl, path, search) : '/dashboard'
  return null
}
