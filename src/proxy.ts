import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { DASHBOARD_PATH, safeNext } from "@/lib/auth-redirect"
import { CRM_HOME, CRM_LOGIN_PATH, crmAllows, crmUrl, isAdminPath, isCrmDeployment } from "@/lib/deployment"
import { allowedDuringOnboarding, ONBOARDING_PATH_FOR, onboardingRequired } from "@/lib/onboarding"
import { hostRoute, START_PATH } from "@/lib/site"
import {
  HOME_FOR_ROLE,
  homeFor,
  isSupabaseEnabled,
  ONBOARDING_PATH,
  PT_LOGIN_PATH,
  PT_ONBOARDING_PATH,
  ptOnboardingRequired,
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

/** Webhooks anropas av Stripe, RevenueCat och Fitbit – de verifieras med signatur i stället. */
// v47: Resends leveranskvitton (signerade) och avregistrering med ett klick från mejlklienten (slumpad nyckel).
const WEBHOOKS = ["/api/stripe/webhook", "/api/revenuecat/webhook", "/api/wearables/fitbit/webhook", "/api/resend/webhook", "/api/crm/unsubscribe"]

/**
 * CSRF-skydd för API:t utöver SameSite=Lax-cookien: skrivande anrop
 * (POST/PUT/PATCH/DELETE) måste komma från samma ursprung. Webbläsare skickar
 * alltid Origin vid sådana anrop; mobilappen laddar webbappen från dess egen
 * domän och räknas därför som samma ursprung. Anrop utan Origin (servrar,
 * curl) har ingen cookie från en annan sajt och släpps igenom.
 */
function isCrossSiteApiWrite(request: NextRequest): boolean {
  const { pathname } = request.nextUrl
  if (!pathname.startsWith("/api/") || WEBHOOKS.includes(pathname)) return false
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return false
  const origin = request.headers.get("origin")
  if (!origin) return false
  try {
    return new URL(origin).host !== (request.headers.get("host") ?? request.nextUrl.host)
  } catch {
    return true
  }
}

/**
 * Förnyar Supabase-sessionen och skyddar app-routes.
 *
 * Det här är bara navigering: den verkliga åtkomstkontrollen sker med RLS i
 * databasen, så en manipulerad roll i användarens metadata ger ingen data.
 */
export async function proxy(request: NextRequest) {
  if (isCrossSiteApiWrite(request)) return NextResponse.json({ error: "Otillåtet ursprung" }, { status: 403 })

  // v48: CRM-driftsättningen (COAVIRA_DEPLOYMENT=crm) – bara CRM:et, ingenting av appen.
  if (isCrmDeployment()) return crmProxy(request)
  // Appens driftsättning med ett separat CRM: /admin finns bara där.
  const crm = crmUrl()
  if (crm && (isAdminPath(request.nextUrl.pathname) || request.nextUrl.pathname === CRM_LOGIN_PATH)) {
    return NextResponse.redirect(`${crm}${request.nextUrl.pathname}${request.nextUrl.search}`)
  }

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

  // v47: /admin (internt CRM) kräver inloggning. Att kontot dessutom är administratör
  // avgörs av databasen (is_admin) i admin-layouten och i varje API-anrop – inte här.
  const isAdminArea = path === "/admin" || path.startsWith("/admin/")
  if (!claims) {
    if (isAdminArea) return redirect(`${CRM_LOGIN_PATH}?next=${encodeURIComponent(path)}`)
    if (isProtected) return redirect(`/logga-in?next=${encodeURIComponent(path)}`)
    return response
  }

  // Redan inloggad på administratörsinloggningen: vidare till CRM:et (layouten avgör behörigheten).
  if (path === CRM_LOGIN_PATH) return redirect(safeNext(params.get("next")).startsWith("/admin") ? safeNext(params.get("next")) : CRM_HOME)
  // /admin hanteras av admin-layouten (is_admin i databasen) – inga roll- eller onboardingregler här.
  if (isAdminArea) return response
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
  // Intro-flödet (v31): steg 1 (namn, profilbild) och rollens steg innan resten av
  // appen öppnas. Flaggan står i JWT:n (app_metadata.onboarding_completed) och
  // sätts av databasen (finish_onboarding) – inget extra databasanrop här.
  if (onboardingRequired(claims as { app_metadata?: Record<string, unknown> })) {
    const intro = ONBOARDING_PATH_FOR[role]
    if (AUTH_PAGES.includes(path) || path === ONBOARDING_PATH || path === DASHBOARD_PATH) return redirect(intro)
    if (isProtected && !allowedDuringOnboarding(role, path)) return redirect(intro)
    return response
  }
  if (AUTH_PAGES.includes(path) || path === ONBOARDING_PATH || path === DASHBOARD_PATH) return redirect(home)
  if (isProtected && !path.startsWith(home)) return redirect(home)
  // PT-onboarding (v22): färdig profil och utbetalningar via Stripe innan resten
  // av PT-portalen öppnas. Spärren står i JWT:n (app_metadata.pt_ready), som
  // databasen håller aktuell – inget extra databasanrop här.
  if (role === "trainer" && path.startsWith(HOME_FOR_ROLE.trainer)) {
    const required = ptOnboardingRequired(claims as { app_metadata?: Record<string, unknown> })
    const onOnboarding = path === PT_ONBOARDING_PATH || path.startsWith(`${PT_ONBOARDING_PATH}/`)
    if (required && !onOnboarding) return redirect(PT_ONBOARDING_PATH)
  }

  return response
}

/**
 * CRM-driftsättningen (v48). Bara CRM:ets sidor och API finns; "/" leder till
 * leads och allt annat svarar 404. Ingen roll-, onboarding- eller värdlogik från
 * appen – behörigheten avgörs av databasen (is_admin) i admin-layouten och i API:t.
 */
async function crmProxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  const go = (to: string) => {
    const url = request.nextUrl.clone()
    const [pathname, search = ""] = to.split("?")
    url.pathname = pathname
    url.search = search
    return NextResponse.redirect(url)
  }
  if (path === "/") return go(CRM_HOME)
  if (!crmAllows(path)) {
    return new NextResponse("Hittades inte", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" } })
  }
  if (!isSupabaseEnabled || path.startsWith("/api/")) return NextResponse.next()

  // Förnya sessionen (samma som i appen) och skicka utloggade till inloggningen.
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
  const { data } = await supabase.auth.getClaims()
  const withCookies = (res: NextResponse) => {
    response.cookies.getAll().forEach((c) => res.cookies.set(c))
    return res
  }
  if (!data?.claims && isAdminPath(path)) return withCookies(go(`${CRM_LOGIN_PATH}?next=${encodeURIComponent(path)}`))
  if (data?.claims && path === CRM_LOGIN_PATH) {
    const next = safeNext(request.nextUrl.searchParams.get("next"))
    return withCookies(go(next.startsWith("/admin") ? next : CRM_HOME))
  }
  return response
}

export const config = {
  // robots.txt och sitemap.xml går aldrig genom proxyn: sökmotorer ska alltid få
  // 200 direkt – ingen omdirigering, sessionsförnyelse eller inloggningsspärr.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots\\.txt$|sitemap\\.xml$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
}
