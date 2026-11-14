import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/ai/admin-client'
import { ADMIN_TOKEN_COOKIE, ADMIN_TOKEN_DAYS, makeAdminToken } from '@/lib/admin/admin-token'

/** The signed-in person, when they are AutoShift staff (platform_admins). */
export async function staff() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: NextResponse.json({ error: 'not_signed_in' }, { status: 401 }) } as const
  const db = supabaseAdmin()
  const { data } = await db.from('platform_admins').select('role').eq('user_id', user.id).maybeSingle()
  if (!data) return { ok: false, error: NextResponse.json({ error: 'not_admin' }, { status: 403 }) } as const
  return { ok: true, user, db, role: data.role as string } as const
}

/** Issues this device's admin token (30 days) and records the sign-in. */
export async function signedIn(db: ReturnType<typeof supabaseAdmin>, userId: string, how: string): Promise<Response> {
  const token = await makeAdminToken(userId)
  await db.from('audit_log').insert({ actor_id: userId, scope: 'platform', action: 'admin.sign_in', target: userId, details: { via: how } })
  const res = NextResponse.json({ done: true })
  // Readable by the page so staff calls to the backend can carry it (header X-Admin-2FA).
  res.cookies.set(ADMIN_TOKEN_COOKIE, token, { path: '/', sameSite: 'strict', secure: process.env.NODE_ENV === 'production', httpOnly: false, maxAge: ADMIN_TOKEN_DAYS * 86400 })
  return res
}
