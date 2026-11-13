import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/ai/admin-client'

/** The signed-in person (from their session) and a server-side database client. */
export async function signedIn() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: NextResponse.json({ error: 'Please sign in again' }, { status: 401 }) } as const
  const db = supabaseAdmin()
  const { data: profile } = await db.from('profiles').select('phone, phone_verified_at').eq('user_id', user.id).maybeSingle()
  return { ok: true, user, db, profile } as const
}
