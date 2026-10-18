import type { EmailOtpType } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"

import { safeNext } from "@/lib/auth-redirect"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const TYPES: EmailOtpType[] = ["signup", "email", "recovery", "invite", "magiclink", "email_change"]

/**
 * Bekräftelselänk med token_hash (rekommenderat av Supabase för SSR). Fungerar
 * även när länken öppnas på en annan enhet eller i mejlappens webbläsare,
 * eftersom ingen PKCE-cookie behövs. Användaren loggas in direkt och hamnar i
 * appen. Kräver att e-postmallarna i Supabase pekar hit, t.ex.:
 *
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/nytt-losenord
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const next = safeNext(searchParams.get("next") ?? (type === "recovery" ? "/nytt-losenord" : null))

  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }
  return NextResponse.redirect(`${origin}/logga-in?fel=lank`)
}
