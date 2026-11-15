import { NextResponse, type NextRequest } from "next/server"

import { CRM_LOGIN_PATH } from "@/lib/deployment"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * POST /auth/signout (v48) – loggar ut och skickar till administratörsinloggningen.
 * Används av CRM:et ("Kontot har inte behörighet" → Logga ut). Bara från samma
 * webbplats, så att en annan sajt inte kan logga ut någon.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  if (origin && new URL(origin).host !== (request.headers.get("host") ?? request.nextUrl.host)) {
    return NextResponse.json({ error: "Otillåtet ursprung" }, { status: 403 })
  }
  if (isSupabaseEnabled) await (await createSupabaseServerClient()).auth.signOut()
  return NextResponse.redirect(new URL(CRM_LOGIN_PATH, request.nextUrl.origin), { status: 303 })
}
