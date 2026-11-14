// POST /api/admin/logout — forget this device's admin sign-in.
import { NextResponse } from 'next/server'
import { ADMIN_TOKEN_COOKIE } from '@/lib/admin/admin-token'

export async function POST(): Promise<Response> {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_TOKEN_COOKIE, '', { path: '/', maxAge: 0 })
  return res
}
