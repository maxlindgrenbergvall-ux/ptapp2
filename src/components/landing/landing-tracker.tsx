"use client"

import * as React from "react"

import { ctaFor, type TrackEvent } from "@/lib/analytics/tracking"

/**
 * Cookie-fri statistik för landningssidan (v82): en sidvisning när sidan
 * öppnas och ett klick på "Skapa konto" / "Hitta PT". Inget sparas i
 * webbläsaren; servern räknar besökare med en hash som byts varje dygn.
 */
export function LandingTracker() {
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const base = {
      path: window.location.pathname,
      referrer: document.referrer || undefined,
      utm_source: params.get("utm_source") ?? undefined,
      utm_medium: params.get("utm_medium") ?? undefined,
      utm_campaign: params.get("utm_campaign") ?? undefined,
    }
    const send = (event: TrackEvent) => {
      const body = JSON.stringify({ ...base, event })
      try {
        if (navigator.sendBeacon?.("/api/track/pageview", new Blob([body], { type: "text/plain" }))) return
      } catch {}
      void fetch("/api/track/pageview", { method: "POST", body, keepalive: true }).catch(() => {})
    }
    send("pageview")
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("a, button, [data-track]") as HTMLElement | null
      if (!el) return
      const cta = ctaFor({ track: el.dataset.track, href: el.getAttribute("href"), store: el.dataset.store })
      if (cta) send(cta)
    }
    document.addEventListener("click", onClick, { capture: true })
    return () => document.removeEventListener("click", onClick, { capture: true })
  }, [])
  return null
}
