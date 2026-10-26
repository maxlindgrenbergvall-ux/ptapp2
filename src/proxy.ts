import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { DASHBOARD_PATH } from "@/lib/auth-redirect"
import { hostRoute, START_PATH } from "@/lib/site"
import {
  homeFor,
  isSupabaseEnabled,
  ONBOARDING_PATH,
  PT_LOGIN_PATH,
  roleFromClaims,
  SUPABASE_KEY,
  SUPABASE_URL,
} from "@/lib/supabase/config"

const PROTECTED = ["/pt", "/klient", ONBOARDING_PATH, DASHBOARD_PATH]
/**
 * Sidor för utloggade. Inloggade skickas till sin startsida. START_PATH
 * (/kom-igang) är appens inloggning/registrering; på appens domän och i
 * mobilappen leder "/" dit (hostRoute).
 */
const AUTH_PAGES = [START_PATH, "/logga-in", PT_LOGIN_PATH, "/registrera"]
/** Sidor som ett konto utan vald kontotyp får besöka (allt annat → välkomststeget). */
const ALLOWED_BEFORE_ONBOARDING = [ONBOARDING_PATH, "/integritet", "/nytt-losenord", "/konto-raderat", "/auth/"]

/**
 * Förnyar Supabase-sessionen och skyddar app-routes.
 *
 * Det här är bara navigering: den verkliga åtkomstkontrollen sker med RLS i
 * databasen, så en manipulerad roll i användarens metadata ger ingen data.
 */
export async function proxy(request: NextRequest) {
  // coavira.fit = landningssidan, APP_URL (ptapp2.vercel.app) = appen. Se hostRoute.
  const route = hostRoute({
    host: request.headers.get("host") ?? request.nextUrl.host,
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    method: request.method,
    userAgent: request.headers.get("user-agent"),
  })
  if (route && "redirect" in route) return NextResponse.redirect(route.redirect)
  // Appens domän och mobilappen börjar på inloggningen, inte på landningssidan.
  if (route) {
    const url = request.nextUrl.clone()
    url.pathname = START_PATH
    return NextResponse.redirect(url)
  }

  if (!isSupabaseEnabled) return NextResponse.next()

  // E-postlänkar som hamnat på fel sida (t.ex. Site URL = startsidan när
  // redirect-adressen inte var godkänd i Supabase): skicka koden vidare.
  const params = request.nextUrl.searchParams
  if (!request.nextUrl.pathname.startsWith("/auth/") && !request.nextUrl.pathname.startsWith("/api/")) {
    const target = params.get("code") ? "/auth/callback" : params.get("token_hash") && params.get("type") ? "/auth/confirm" : null
    if (target) {
      const url = request.nextUrl.clone()
      url.pathname = target
      if (!url.searchParams.get("next")) url.searchParams.set("next", DASHBOARD_PATH)
      return NextResponse.redirect(url)
    }
  }

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

  const role = roleFromClaims(claims as { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> })
  const home = homeFor(role)
  // Nytt konto (e-post, Apple eller Google) som inte valt kontotyp än.
  if (!role) {
    if (ALLOWED_BEFORE_ONBOARDING.some((p) => path === p || (p.endsWith("/") && path.startsWith(p)))) return response
    return redirect(ONBOARDING_PATH)
  }
  // PT-konton får bara logga in med e-post och lösenord. En session från Apple/Google
  // (amr = oauth) för ett PT-konto avslutas direkt. (Databasen stoppar dessutom att
  // Apple/Google kopplas till PT-konton, se v8-migrationen.)
  const amr = (claims as { amr?: { method?: string }[] }).amr ?? []
  if (role === "trainer" && amr.some((a) => a.method === "oauth")) {
    await supabase.auth.signOut()
    return redirect(`${PT_LOGIN_PATH}?fel=social`)
  }
  if (AUTH_PAGES.includes(path) || path === ONBOARDING_PATH || path === DASHBOARD_PATH) return redirect(home)
  if (isProtected && !path.startsWith(home)) return redirect(home)

  return response
}

export const config = {
  // robots.txt och sitemap.xml går aldrig genom proxyn: sökmotorer ska alltid få
  // 200 direkt – ingen omdirigering, sessionsförnyelse eller inloggningsspärr.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots\\.txt$|sitemap\\.xml$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
}
