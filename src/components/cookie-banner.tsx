"use client"

/**
 * Cookie-rutan längst ner på coavira.fit (LEK 9 kap. 28 § och GDPR):
 *  - "Godkänn alla" → coavira_cookie_consent = "granted", GA4 startar direkt.
 *  - "Endast nödvändiga" → "denied", GA4 laddas aldrig.
 * Valet sparas i localStorage och rutan visas inte igen förrän besökaren
 * väljer "Cookie-inställningar" (sidfoten, /integritet). Bara på landningsdomänen –
 * aldrig i appen/webbportalen eller mobilappen.
 *
 * Animationen är ren CSS (tw-animate-css), så rutan drar inte in något
 * animationsbibliotek i appens gemensamma layout.
 */
import Link from "next/link"
import * as React from "react"

import { openCookieSettings, saveConsent, useConsent, useConsentApplies, useOnOpenCookieSettings, type Consent } from "@/lib/consent"
import { cn } from "@/lib/utils"

const BUTTON =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-3 text-sm font-semibold whitespace-nowrap transition-[background-color,transform] outline-none active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#aced37] focus-visible:ring-offset-2 focus-visible:ring-offset-[#11161d] border border-white/20 bg-white/[0.08] hover:bg-white/[0.14]"

export function CookieBanner() {
  const applies = useConsentApplies()
  const consent = useConsent()
  const [reopened, setReopened] = React.useState(false)
  const [closing, setClosing] = React.useState(false)
  useOnOpenCookieSettings(() => {
    setClosing(false)
    setReopened(true)
  })

  if (!applies || (consent !== null && !reopened)) return null

  const choose = (choice: Consent) => {
    setClosing(true)
    // Låt utanimationen spela klart innan rutan försvinner (vid "minska rörelse" direkt).
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    window.setTimeout(
      () => {
        saveConsent(choice)
        setReopened(false)
        setClosing(false)
      },
      reduce ? 0 : 200
    )
  }

  return (
    <section
      aria-label="Cookies"
      data-testid="cookie-banner"
      className={cn(
        "fixed inset-x-3 bottom-[calc(var(--safe-bottom)+0.75rem)] z-50 mx-auto max-w-lg rounded-2xl border border-white/10 bg-[#11161d] p-4 text-[#f4f7f2] shadow-2xl shadow-black/50 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:p-5",
        "duration-300 ease-out motion-reduce:animate-none",
        closing ? "pointer-events-none animate-out fade-out-0 slide-out-to-bottom-4 fill-mode-forwards" : "animate-in fade-in-0 slide-in-from-bottom-6"
      )}
    >
      <div className="flex gap-3">
        <span aria-hidden className="mt-0.5 text-lg leading-none">
          🍪
        </span>
        <p className="text-sm leading-relaxed text-white/80">
          Vi använder nödvändiga cookies för att sidan ska fungera, samt statistik-cookies för att analysera trafik och förbättra
          upplevelsen på coavira.fit.{" "}
          <Link href="/integritet#cookies" className="font-medium whitespace-nowrap text-[#aced37] underline underline-offset-4">
            Läs mer
          </Link>
        </p>
      </div>
      <div className="mt-4 flex flex-col-reverse gap-2 min-[380px]:flex-row">
        {/* Lika stora och lika tydliga val: att avböja ska vara lika enkelt som att godkänna (IMY/EDPB). */}
        <button type="button" onClick={() => choose("denied")} className={BUTTON}>
          Endast nödvändiga
        </button>
        <button type="button" onClick={() => choose("granted")} className={BUTTON}>
          Godkänn alla
        </button>
      </div>
    </section>
  )
}

/** Visar cookie-rutan igen så att besökaren kan ändra sitt val. */
export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={openCookieSettings} className={className}>
      Cookie-inställningar
    </button>
  )
}
