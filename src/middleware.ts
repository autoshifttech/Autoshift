import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { ADMIN_COOKIE } from '@/lib/admin/session'
import { readAdminToken } from '@/lib/admin/admin-token'
import { siteRole, siteRoleRedirect } from '@/lib/site-role'

// Every top-level route under src/app/(dashboard)/ belongs here —
// middleware.test.ts reads that directory and fails on a missing one.
const PROTECTED_PATHS = ['/dashboard', '/inbox', '/contacts', '/broadcasts', '/automations', '/flows', '/agents', '/notifications', '/settings', '/onboarding', '/wallet', '/templates', '/ai-tools', '/leads', '/orders', '/segments', '/drips', '/insights', '/files', '/opt-ins', '/support', '/verify-phone']

/** Set by the database (migration 080) when a login is on the AutoShift admin team. */
function isAdminType(user: { app_metadata?: Record<string, unknown> }): boolean {
  return user.app_metadata?.account_type === 'admin'
}

export async function middleware(request: NextRequest) {
  // Separate links: this service may be only the admin panel or only the business app (SITE_ROLE).
  const elsewhere = siteRoleRedirect(siteRole(process.env.SITE_ROLE), request.nextUrl.pathname, request.nextUrl.search, {
    adminUrl: process.env.ADMIN_SITE_URL,
    appUrl: process.env.APP_SITE_URL,
  })
  if (elsewhere) return NextResponse.redirect(elsewhere.startsWith('/') ? new URL(elsewhere, request.url) : elsewhere)

  // Platform admin panel: every /admin page but the sign-in needs a genuine, unexpired admin
  // device token (issued by /api/admin/login after the password and, when on, the WhatsApp code).
  const pathname = request.nextUrl.pathname
  const adminPath = (pathname === '/admin' || pathname.startsWith('/admin/')) && pathname !== '/admin/login'
  const adminTokenUser = adminPath ? await readAdminToken(request.cookies.get(ADMIN_COOKIE)?.value) : null
  if (adminPath && !adminTokenUser) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  // No Supabase project yet: public pages work, the app sends people to
  // /login (which explains sign-in isn't connected), app APIs answer 503.
  if (!isSupabaseConfigured()) {
    const path = request.nextUrl.pathname
    if (PROTECTED_PATHS.some((p) => path.startsWith(p))) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.search = ''
      return NextResponse.redirect(url)
    }
    if (path.startsWith('/api/whatsapp/') && !path.includes('/webhook')) {
      return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 })
    }
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()


  // getUser() transparently refreshes an expired access token, which
  // ROTATES the refresh token and writes the new cookies onto
  // `supabaseResponse` via setAll() above. Any response we return in
  // place of `supabaseResponse` (every redirect / JSON branch below)
  // is a fresh object that does NOT carry those Set-Cookie headers, so
  // the rotated token never reaches the browser. The next request then
  // replays the old, now-consumed refresh token, the refresh fails, and
  // the session wedges — the user gets a broken reload after idling and
  // can only recover by manually clearing cookies (issue #288). Copy the
  // refreshed cookies onto whatever response we hand back to fix that.
  const withRefreshedCookies = <T extends NextResponse>(response: T): T => {
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie)
    })
    return response
  }

  // One browser holds one sign-in. If it now belongs to someone else (e.g. the business account was
  // signed in after the admin), the admin device token doesn't match: go back to the admin sign-in.
  if (adminPath && (!user || user.id !== adminTokenUser)) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin/login'
    url.search = ''
    const res = NextResponse.redirect(url)
    res.cookies.set(ADMIN_COOKIE, '', { path: '/', maxAge: 0 })
    return withRefreshedCookies(res)
  }

  // Auth pages - redirect to dashboard if already logged in.
  // Exception: when an invite token is in the query string we
  // send the already-signed-in user to /join/<token> instead so
  // they can accept the invitation in one click. Without this,
  // a forwarded invite link to someone who's already signed in
  // would silently drop them on /dashboard.
  if (user && (
    request.nextUrl.pathname === '/login' ||
    request.nextUrl.pathname === '/signup'
  )) {
    const url = request.nextUrl.clone()
    const inviteToken = request.nextUrl.searchParams.get('invite')
    if (
      inviteToken &&
      (request.nextUrl.pathname === '/login' ||
        request.nextUrl.pathname === '/signup')
    ) {
      url.pathname = `/join/${encodeURIComponent(inviteToken)}`
      url.search = ''
    } else {
      url.pathname = isAdminType(user) ? '/admin' : '/dashboard'
      url.search = ''
    }
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  // Admin-type logins (the AutoShift team) use the admin panel, never the business app.
  // Their own WhatsApp number check (/verify-phone) stays open for admin sign-in codes.
  if (
    user &&
    isAdminType(user) &&
    request.nextUrl.pathname !== '/verify-phone' &&
    PROTECTED_PATHS.some((path) => request.nextUrl.pathname.startsWith(path))
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin'
    url.search = ''
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  // Protected pages - redirect to login if not authenticated
  if (!user && PROTECTED_PATHS.some(path => request.nextUrl.pathname.startsWith(path))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return withRefreshedCookies(NextResponse.redirect(url))
  }

  // API routes that need auth (not webhooks)
  if (!user && request.nextUrl.pathname.startsWith('/api/whatsapp/') &&
      !request.nextUrl.pathname.includes('/webhook')) {
    return withRefreshedCookies(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
