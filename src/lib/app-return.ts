/**
 * Retur från Stripe Checkout till Coavira-appen (iOS/Android).
 *
 * I appen öppnas betalningen i systemets webbläsarvy (src/lib/native/checkout.ts),
 * så Stripe kan inte skicka tillbaka till appens WebView direkt. Servern sätter
 * i stället success_url/cancel_url till /app-retur/<sökväg> (returnBase), och
 * den sidan lämnar över till appens URL-schema: com.coavira.app://<sökväg>.
 * Ren TypeScript utan Capacitor – används både av servern och av sidan.
 */
import { isAppUserAgent } from "@/lib/site"

/** Appens egna URL-schema (iOS CFBundleURLSchemes, Android intent-filter). */
export const APP_SCHEME = "com.coavira.app"

/** Prefix för Stripes retur-adresser när köpet görs i appen (src/app/app-retur). */
export const APP_RETURN_PREFIX = "/app-retur"

/**
 * Servern: basadressen för success_url/cancel_url. Från appen går retur-
 * adresserna via /app-retur; på webben direkt till sidan som förut.
 */
export function returnBase(origin: string, userAgent: string | null): string {
  return isAppUserAgent(userAgent) ? `${origin}${APP_RETURN_PREFIX}` : origin
}

/**
 * Sökvägen i appen som en /app-retur-adress gäller (med query), eller null om
 * den är ogiltig. Bara interna sökvägar – ingen öppen omdirigering.
 */
export function appReturnTarget(pathname: string, search: string): string | null {
  if (!pathname.startsWith(`${APP_RETURN_PREFIX}/`)) return null
  const path = pathname.slice(APP_RETURN_PREFIX.length)
  if (!/^\/[a-z0-9]/i.test(path) || path.includes("//") || path.includes("\\") || path.startsWith(`${APP_RETURN_PREFIX}/`)) return null
  return `${path}${search}`
}

/** com.coavira.app://klient/kop?session_id=… för en intern sökväg. */
export function appDeepLink(target: string): string {
  return `${APP_SCHEME}:/${target}`
}
