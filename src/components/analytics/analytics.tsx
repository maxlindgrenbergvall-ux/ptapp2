"use client"

/**
 * Google Analytics 4 på landningsdomänen (coavira.fit) – med samtycke.
 *
 * - Laddas bara på coavira.fit (LANDING_HOSTS), aldrig i appen/webbportalen
 *   (ptapp2.vercel.app), i mobilappen (CoaviraApp), på localhost eller i
 *   förhandsversioner. Appen hanterar hälsodata och ska inte spåras.
 * - GA sätter cookies, så enligt LEK/GDPR laddas taggen först när besökaren
 *   godkänt statistik i rutan. "Bara nödvändiga" är lika enkelt som "Godkänn".
 *   Valet sparas i localStorage och kan ändras via "Cookie-inställningar" i sidfoten.
 * - next/script med strategy="afterInteractive": ingen påverkan på första
 *   renderingen eller LCP. Inga annonsfunktioner (ad_* nekas, inga Google signals).
 */
import Script from "next/script"
import * as React from "react"

import { isAppUserAgent, LANDING_HOSTS } from "@/lib/site"

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID?.trim() || "G-23NXJ2VS0B"
const KEY = "coavira:analytics"
/** Skickas av knappen "Cookie-inställningar" för att visa rutan igen. */
export const OPEN_COOKIE_SETTINGS = "coavira:cookie-settings"
const CHANGED = "coavira:analytics-changed"

type Choice = "granted" | "denied" | null

const readChoice = (): Choice => {
  try {
    const v = window.localStorage.getItem(KEY)
    return v === "granted" || v === "denied" ? v : null
  } catch {
    return null
  }
}
const subscribe = (cb: () => void) => {
  window.addEventListener(CHANGED, cb)
  window.addEventListener("storage", cb)
  return () => {
    window.removeEventListener(CHANGED, cb)
    window.removeEventListener("storage", cb)
  }
}
/** Analys bara på landningsdomänen och aldrig i mobilappen. */
const enabledHere = () => LANDING_HOSTS.includes(window.location.hostname.toLowerCase()) && !isAppUserAgent(navigator.userAgent)
const subscribeNoop = () => () => {}

function saveChoice(choice: "granted" | "denied") {
  try {
    window.localStorage.setItem(KEY, choice)
  } catch {}
  const w = window as typeof window & { gtag?: (...args: unknown[]) => void }
  if (choice === "denied") {
    // Taggen kan inte laddas ur: neka vidare mätning och ta bort GA-cookies.
    w.gtag?.("consent", "update", { analytics_storage: "denied" })
    const domain = window.location.hostname.replace(/^www\./, "")
    for (const name of document.cookie.split(";").map((c) => c.split("=")[0].trim())) {
      if (name === "_ga" || name.startsWith("_ga_")) {
        for (const d of ["", `; domain=${domain}`, `; domain=.${domain}`]) document.cookie = `${name}=; Max-Age=0; path=/${d}`
      }
    }
  } else {
    w.gtag?.("consent", "update", { analytics_storage: "granted" })
  }
  window.dispatchEvent(new Event(CHANGED))
}

export function Analytics() {
  const enabled = React.useSyncExternalStore(subscribeNoop, enabledHere, () => false)
  const choice = React.useSyncExternalStore(subscribe, readChoice, () => null)
  const [reopened, setReopened] = React.useState(false)

  React.useEffect(() => {
    const open = () => setReopened(true)
    window.addEventListener(OPEN_COOKIE_SETTINGS, open)
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS, open)
  }, [])

  if (!enabled) return null
  return (
    <>
      {choice === "granted" && (
        <>
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;` +
              `gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});` +
              `gtag('js',new Date());gtag('config','${GA_ID}',{allow_google_signals:false,allow_ad_personalization_signals:false});`}
          </Script>
          <Script id="ga4" src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
        </>
      )}
      {(choice === null || reopened) && (
        <CookieBanner
          onChoose={(c) => {
            saveChoice(c)
            setReopened(false)
          }}
        />
      )}
    </>
  )
}

function CookieBanner({ onChoose }: { onChoose: (choice: "granted" | "denied") => void }) {
  const btn =
    "inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-white/20 bg-white/[0.08] px-4 text-sm font-semibold transition-colors outline-none hover:bg-white/[0.16] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
  return (
    <div
      role="region"
      aria-label="Cookies"
      data-testid="cookie-banner"
      className="fixed inset-x-3 bottom-[calc(var(--safe-bottom)+0.75rem)] z-50 mx-auto max-w-md rounded-2xl border border-white/10 bg-[#11161d] p-4 text-[#f4f7f2] shadow-2xl shadow-black/50 sm:inset-x-auto sm:right-6 sm:bottom-6"
    >
      <p className="text-sm leading-relaxed text-white/80">
        Vi vill använda Google Analytics för att se hur sidan används. Det sätter statistikcookies – bara om du godkänner.{" "}
        <a href="/integritet#cookies" className="font-medium text-brand underline underline-offset-4">
          Läs mer
        </a>
      </p>
      <div className="mt-3 flex gap-2">
        {/* Lika tydliga val (IMY/EDPB: avböja ska vara lika enkelt som att godkänna). */}
        <button type="button" onClick={() => onChoose("denied")} className={btn}>
          Bara nödvändiga
        </button>
        <button type="button" onClick={() => onChoose("granted")} className={btn}>
          Godkänn statistik
        </button>
      </div>
    </div>
  )
}

/** Knapp i sidfoten: visar samtyckesrutan igen (krävs för att kunna ändra sitt val). */
export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS))} className={className}>
      Cookie-inställningar
    </button>
  )
}
