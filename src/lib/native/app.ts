/**
 * Coavira som native app (Capacitor, iOS/Android).
 *
 * Appen laddar den vanliga webbtjänsten i en WebView. Capacitor lägger då in
 * en brygga (window.Capacitor) så att webbkoden kan använda native-funktioner:
 * systemwebbläsare för inloggning, djuplänkar och push-notiser. På webben är
 * allt här avstängt – samma kod körs som förut.
 */
import { Capacitor } from "@capacitor/core"

import { safeNext } from "@/lib/auth-redirect"

/** Appens egna URL-schema (iOS CFBundleURLSchemes, Android intent-filter). */
export const APP_SCHEME = "com.coavira.app"

export type NativePlatform = "ios" | "android"

/** Körs vi i Coavira-appen (inte i en vanlig webbläsare)? */
export function isNativeApp(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform()
}

export function nativePlatform(): NativePlatform | null {
  if (!isNativeApp()) return null
  const p = Capacitor.getPlatform()
  return p === "ios" || p === "android" ? p : null
}

/**
 * Har just den här app-versionen push konfigurerat (Firebase/APNs)? Bygget
 * sätter "CoaviraPush" i user agent bara när push-nycklarna finns, så att en
 * app utan dem aldrig försöker registrera sig (Android kraschar annars).
 */
export function nativePushAvailable(): boolean {
  return isNativeApp() && /\bCoaviraPush\b/.test(navigator.userAgent)
}

/**
 * Dit Apple/Google skickar tillbaka användaren i appen. Inloggningen sker i
 * systemets webbläsare (Google tillåter inte inloggning i en WebView) och
 * kommer tillbaka till appen via appens URL-schema.
 */
export function nativeAuthCallbackUrl(next: string): string {
  return `${APP_SCHEME}://auth/callback?next=${encodeURIComponent(safeNext(next))}`
}

/**
 * Översätter en djuplänk till en intern sökväg i appen, eller null om den ska
 * ignoreras. Godtar:
 *  - com.coavira.app://auth/callback?code=…  → /auth/callback?code=…
 *  - com.coavira.app://klient/kalender        → /klient/kalender
 *  - https://<appens domän>/klient/chatt       → /klient/chatt (App Links / Universal Links)
 * Allt annat (andra domäner, //-sökvägar) avvisas – ingen öppen omdirigering.
 */
export function appUrlToPath(url: string, origin: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  let path: string
  if (u.protocol === `${APP_SCHEME}:`) {
    // com.coavira.app://auth/callback → host "auth", pathname "/callback"
    path = `/${u.host}${u.pathname === "/" ? "" : u.pathname}`
  } else if ((u.protocol === "https:" || u.protocol === "http:") && u.origin === origin) {
    path = u.pathname
  } else {
    return null
  }
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null
  return `${path}${u.search}`
}

/**
 * Får digitala tjänster (Coavira Plus, PT Boost) köpas med Stripe här?
 *
 * Apple (App Review Guidelines 3.1.1) kräver Apples köpsystem för digitalt
 * innehåll och digitala tjänster i iOS-appar. PT-pass och kostcoaching är
 * tjänster som utförs av en person och får betalas med Stripe även i appen
 * (3.1.3(e)). Därför visas köp av Plus och Boost inte i iOS-appen – på webben
 * och i Android-appen fungerar de som vanligt.
 */
export function digitalPurchasesAllowed(): boolean {
  return nativePlatform() !== "ios"
}
