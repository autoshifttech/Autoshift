// GET  /api/admin/account                       — this admin's username.
// POST /api/admin/account { username, password } — set the username and password used on the admin login.
// Only for staff who are fully signed in (WhatsApp code passed on this device, when codes are on).
import { NextResponse } from 'next/server'
import { adminTokenFromCookies, verifyAdminToken } from '@/lib/admin/admin-token'
import { getOtpSettings, hasSender } from '@/lib/auth/phone-otp'
import { USERNAME_RE, passwordProblem } from '@/lib/admin/admin-password'
import { staff } from '../login/shared'

async function fullySignedIn() {
  const ctx = await staff()
  if (!ctx.ok) return ctx
  const settings = await getOtpSettings(ctx.db)
  const needsCode = settings.admin_2fa && hasSender(settings)
  if (needsCode && !(await verifyAdminToken(await adminTokenFromCookies(), ctx.user.id))) {
    return { ok: false, error: NextResponse.json({ error: 'not_verified' }, { status: 403 }) } as const
  }
  return ctx
}

export async function GET(): Promise<Response> {
  const ctx = await fullySignedIn()
  if (!ctx.ok) return ctx.error
  const { data } = await ctx.db.from('platform_admins').select('username').eq('user_id', ctx.user.id).maybeSingle()
  return NextResponse.json({ username: (data?.username as string | null) ?? null, email: ctx.user.email ?? null })
}

export async function POST(request: Request): Promise<Response> {
  const ctx = await fullySignedIn()
  if (!ctx.ok) return ctx.error
  const body = (await request.json().catch(() => null)) as { username?: string; password?: string } | null
  const username = String(body?.username ?? '').trim().toLowerCase()
  const password = String(body?.password ?? '')
  if (!USERNAME_RE.test(username)) return NextResponse.json({ error: 'bad_username' }, { status: 422 })
  const problem = passwordProblem(password)
  if (problem) return NextResponse.json({ error: problem }, { status: 422 })

  const { data: taken } = await ctx.db.from('platform_admins').select('user_id').eq('username', username).maybeSingle()
  if (taken && taken.user_id !== ctx.user.id) return NextResponse.json({ error: 'username_taken' }, { status: 409 })

  const { error: pwError } = await ctx.db.auth.admin.updateUserById(ctx.user.id, { password })
  if (pwError) return NextResponse.json({ error: 'save_failed' }, { status: 502 })
  const { error } = await ctx.db.from('platform_admins').update({ username }).eq('user_id', ctx.user.id)
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'username_taken' : 'save_failed' }, { status: error.code === '23505' ? 409 : 502 })
  await ctx.db.from('audit_log').insert({ actor_id: ctx.user.id, scope: 'platform', action: 'admin.password_set', target: ctx.user.id, details: { username } })
  return NextResponse.json({ ok: true, username })
}
