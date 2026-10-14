import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import {
  HOME_FOR_ROLE,
  isSupabaseEnabled,
  roleFromMetadata,
  SUPABASE_KEY,
  SUPABASE_URL,
} from "@/lib/supabase/config"

const PROTECTED = ["/pt", "/klient"]
const AUTH_PAGES = ["/logga-in", "/registrera"]

/**
 * Förnyar Supabase-sessionen och skyddar app-routes.
 *
 * Det här är bara navigering: den verkliga åtkomstkontrollen sker med RLS i
 * databasen, så en manipulerad roll i användarens metadata ger ingen data.
 */
export async function proxy(request: NextRequest) {
  if (!isSupabaseEnabled) return NextResponse.next()

  let response = NextResponse.next({ request })
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  // getClaims() verifierar JWT:n (till skillnad från getSession()).
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  const path = request.nextUrl.pathname

  const redirect = (to: string) => {
    const url = request.nextUrl.clone()
    const [pathname, search = ""] = to.split("?")
    url.pathname = pathname
    url.search = search
    const res = NextResponse.redirect(url)
    // Behåll eventuellt förnyade sessionscookies.
    response.cookies.getAll().forEach((c) => res.cookies.set(c))
    return res
  }

  const isProtected = PROTECTED.some((p) => path === p || path.startsWith(`${p}/`))

  if (!claims) {
    if (isProtected) return redirect(`/logga-in?next=${encodeURIComponent(path)}`)
    return response
  }

  const home = HOME_FOR_ROLE[roleFromMetadata(claims.user_metadata)]
  if (AUTH_PAGES.includes(path) || path === "/") return redirect(home)
  if (isProtected && !path.startsWith(home)) return redirect(home)

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
}
