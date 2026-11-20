// POST /api/admin/login/password { login, password } — admin sign-in with a username (or email) and
// password. On success the browser has a session; the page then calls /api/admin/login/start, which sends
// the WhatsApp code exactly as after Google. Wrong username, wrong password and "not an admin" all get the
// same answer, so the form can't be used to find out who is on the team.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/ai/admin-client'
import { checkRateLimit } from '@/lib/rate-limit'
import { cleanLogin } from '@/lib/admin/admin-password'

const wrong = () => NextResponse.json({ error: 'wrong_login' }, { status: 401 })

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { login?: string; password?: string } | null
  const login = cleanLogin(String(body?.login ?? ''))
  const password = String(body?.password ?? '')
  if (!login || !password || password.length > 200) return wrong()

  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  // 5 tries per username and 20 per address in 15 minutes.
  for (const key of [`admin-pw:${login}`, `admin-pw-ip:${ip}`]) {
    const limit = checkRateLimit(key, { limit: key.includes('-ip:') ? 20 : 5, windowMs: 15 * 60_000 })
    if (!limit.success) {
      return NextResponse.json({ error: 'locked', retry_after: Math.max(1, Math.ceil((limit.reset - Date.now()) / 1000)) }, { status: 429 })
    }
  }

  const db = supabaseAdmin()
  let email = login
  if (!login.includes('@')) {
    const { data: admin } = await db.from('platform_admins').select('user_id').eq('username', login).maybeSingle()
    if (!admin) return wrong()
    const { data: found } = await db.auth.admin.getUserById(admin.user_id as string)
    if (!found?.user?.email) return wrong()
    email = found.user.email.toLowerCase()
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    await db.from('audit_log').insert({ actor_id: null, scope: 'platform', action: 'admin.password_failed', target: login.slice(0, 120), details: { ip } })
    return wrong()
  }
  const { data: staff } = await db.from('platform_admins').select('role').eq('user_id', data.user.id).maybeSingle()
  if (!staff) {
    await supabase.auth.signOut()
    return wrong()
  }
  return NextResponse.json({ ok: true })
}
