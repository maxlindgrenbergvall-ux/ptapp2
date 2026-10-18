import { NextResponse, type NextRequest } from "next/server"

import { safeNext } from "@/lib/auth-redirect"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * Landningssida för PKCE-länkar (bekräfta konto, återställ lösenord, Apple/Google).
 * Byter engångskoden mot en session och skickar vidare – som standard till
 * /dashboard, som i sin tur skickar till rätt startsida för rollen.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get("code")
  const next = safeNext(searchParams.get("next"))

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
    // Länken öppnades i en annan webbläsare/enhet än registreringen (PKCE-nyckeln
    // saknas). E-posten är ändå bekräftad av Supabase – be användaren logga in.
    if (/verifier|code_verifier/i.test(error.message)) {
      return NextResponse.redirect(`${origin}/logga-in?bekraftad=1&next=${encodeURIComponent(next)}`)
    }
  }
  const description = searchParams.get("error_description")
  return NextResponse.redirect(`${origin}/logga-in?fel=lank${description ? `&orsak=${encodeURIComponent(description.slice(0, 120))}` : ""}`)
}
