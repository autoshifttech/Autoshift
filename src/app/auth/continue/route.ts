// GET /auth/continue?next=… — after the email code is entered in the page, send the person on:
// new sign-ups to the setup wizard, everyone else to `next` (see src/lib/auth/after-sign-in.ts).
import { createClient } from '@/lib/supabase/server'
import { afterSignIn } from '@/lib/auth/after-sign-in'
import { relativeRedirect, safeNextPath } from '@/lib/auth/callback'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const next = safeNextPath(new URL(request.url).searchParams.get('next'))
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return relativeRedirect('/login')
  return relativeRedirect(await afterSignIn(supabase, next))
}
