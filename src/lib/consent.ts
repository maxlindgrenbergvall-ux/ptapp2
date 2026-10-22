/**
 * Cookie-samtycke för landningssidan (coavira.fit). Delas av CookieBanner och
 * GoogleAnalytics så att GA4 startar direkt när besökaren godkänner – utan omladdning.
 *
 * Valet sparas i localStorage under "coavira_cookie_consent" ("granted" | "denied").
 * Bara på landningsdomänen (LANDING_HOSTS) och aldrig i mobilappen: appen och
 * webbportalen (ptapp2.vercel.app) varken visar rutan eller laddar GA4.
 */
import * as React from "react"

import { isAppUserAgent, LANDING_HOSTS } from "@/lib/site"

export type Consent = "granted" | "denied"

export const CONSENT_KEY = "coavira_cookie_consent"
/** Tidigare nyckel (första GA4-versionen) – läses om den nya saknas. */
const LEGACY_KEY = "coavira:analytics"
const CHANGED = "coavira:consent-changed"
/** Skickas av "Cookie-inställningar" för att visa rutan igen. */
const OPEN_SETTINGS = "coavira:cookie-settings"

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID?.trim() || "G-23NXJ2VS0B"

type Gtag = (...args: unknown[]) => void
const gtag = (...args: unknown[]) => (window as typeof window & { gtag?: Gtag }).gtag?.(...args)

function readConsent(): Consent | null {
  try {
    const v = window.localStorage.getItem(CONSENT_KEY) ?? window.localStorage.getItem(LEGACY_KEY)
    return v === "granted" || v === "denied" ? v : null
  } catch {
    return null
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(CHANGED, cb)
  window.addEventListener("storage", cb)
  return () => {
    window.removeEventListener(CHANGED, cb)
    window.removeEventListener("storage", cb)
  }
}

/** Sparar valet. "denied" stänger av mätningen och tar bort GA:s cookies. */
export function saveConsent(consent: Consent) {
  try {
    window.localStorage.setItem(CONSENT_KEY, consent)
    window.localStorage.removeItem(LEGACY_KEY)
  } catch {}
  gtag("consent", "update", { analytics_storage: consent })
  if (consent === "denied") {
    // GA-skriptet kan inte laddas ur; utan samtycke mäter det inget och cookies tas bort.
    const domain = window.location.hostname.replace(/^www\./, "")
    for (const name of document.cookie.split(";").map((c) => c.split("=")[0].trim())) {
      if (name !== "_ga" && !name.startsWith("_ga_")) continue
      for (const d of ["", `; domain=${domain}`, `; domain=.${domain}`]) document.cookie = `${name}=; Max-Age=0; path=/${d}`
    }
  }
  window.dispatchEvent(new Event(CHANGED))
}

/** Besökarens val (null = inget val än, och alltid null på servern). */
export function useConsent(): Consent | null {
  return React.useSyncExternalStore(subscribe, readConsent, () => null)
}

const noop = () => () => {}
const onLandingSite = () => LANDING_HOSTS.includes(window.location.hostname.toLowerCase()) && !isAppUserAgent(navigator.userAgent)

/** Sant bara på coavira.fit (+ www) i webbläsaren – inte i appen, på localhost eller i förhandsversioner. */
export function useConsentApplies(): boolean {
  return React.useSyncExternalStore(noop, onLandingSite, () => false)
}

export const openCookieSettings = () => window.dispatchEvent(new Event(OPEN_SETTINGS))

/** Anropar fn när någon vill ändra sitt val (knappen "Cookie-inställningar"). */
export function useOnOpenCookieSettings(fn: () => void) {
  const ref = React.useRef(fn)
  React.useEffect(() => {
    ref.current = fn
  })
  React.useEffect(() => {
    const open = () => ref.current()
    window.addEventListener(OPEN_SETTINGS, open)
    return () => window.removeEventListener(OPEN_SETTINGS, open)
  }, [])
}
