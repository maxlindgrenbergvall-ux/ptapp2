/**
 * Stripe Checkout i Coavira-appen (iOS/Android).
 *
 * I appen öppnas betalningen i systemets webbläsarvy (@capacitor/browser:
 * SFSafariViewController på iOS, Custom Tabs på Android) – inte i appens
 * WebView. Där finns alltid "Klar"/stäng, så att man kan ångra sig.
 *
 * Tillbaka till appen:
 *  - Servern sätter success_url/cancel_url till /app-retur/… när köpet startas
 *    från appen (src/lib/app-return.ts). Sidan skickar vidare till appens URL-schema
 *    (com.coavira.app://klient/kop?session_id=…), som NativeBridge fångar
 *    (appUrlOpen): webbläsarvyn stängs och appen öppnar sidan som bekräftar köpet.
 *  - Stänger man själv vyn ("Klar") löser openCheckout ut, så att knappen
 *    slutar snurra. Betalda köp registreras ändå av Stripes webhook.
 * På webben är det som förut: hela sidan går till Stripe.
 */
import type { PluginListenerHandle } from "@capacitor/core"

import { isNativeApp } from "@/lib/native/app"

export type CheckoutResult =
  /** Webben: sidan går vidare till Stripe. */
  | "navigating"
  /** Appen: betalningsvyn är stängd (av användaren eller av appen efter betalningen). */
  | "closed"

/** Öppna en Stripe Checkout-adress: webbläsarvy i appen, hela sidan på webben. */
export async function openCheckout(url: string): Promise<CheckoutResult> {
  if (!isNativeApp()) {
    window.location.assign(url)
    return "navigating"
  }
  const [{ Browser }, { App }] = await Promise.all([import("@capacitor/browser"), import("@capacitor/app")])
  return new Promise<CheckoutResult>((resolve) => {
    const handles: Promise<PluginListenerHandle>[] = []
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      handles.forEach((h) => void h.then((x) => x.remove()).catch(() => {}))
      resolve("closed")
    }
    // "Klar" i Safari-vyn / tillbaka på Android.
    handles.push(Browser.addListener("browserFinished", done))
    // Stripe skickade tillbaka till appen (NativeBridge stänger vyn och navigerar).
    handles.push(App.addListener("appUrlOpen", done))
    Browser.open({ url, presentationStyle: "fullscreen" }).catch(() => {
      // Pluginen saknas (mycket gammal app-version): betala i WebView som förut.
      settled = true
      handles.forEach((h) => void h.then((x) => x.remove()).catch(() => {}))
      window.location.assign(url)
      resolve("navigating")
    })
  })
}
