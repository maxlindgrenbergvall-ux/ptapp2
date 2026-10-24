"use client"

import * as React from "react"

import { appUrlToPath, isNativeApp } from "@/lib/native/app"

const LAUNCH_KEY = "coavira:launch-url-handled"

/**
 * Kopplar ihop webbappen med den native appen (bara i appen; gör ingenting på
 * webben):
 *  - Djuplänkar (com.coavira.app://… och appens https-länkar) öppnar rätt sida.
 *    Inloggning med Apple/Google kommer tillbaka hit med en engångskod som
 *    växlas mot en session på /auth/callback, i appens egen WebView.
 *  - Tryck på en push-notis öppnar sidan notisen gäller.
 *  - Externa länkar (integritetspolicy, villkor, support, videor …) öppnas i
 *    appens inbyggda webbläsare (SFSafariViewController / Custom Tabs), så att
 *    appen och inloggningen ligger kvar under. Stripe Checkout öppnas däremot i
 *    appens WebView (allowNavigation i capacitor.config.ts) och kommer tillbaka
 *    till appen efter betalningen – samma session hela vägen.
 */
export function NativeBridge() {
  React.useEffect(() => {
    if (!isNativeApp()) return
    let cancelled = false
    const removers: (() => void)[] = []

    void (async () => {
      // Laddas bara i appen: push.ts drar in Supabase-klienten, som landningssidan inte behöver.
      const [{ App }, { Browser }, { handlePushTap }] = await Promise.all([
        import("@capacitor/app"),
        import("@capacitor/browser"),
        import("@/lib/native/push"),
      ])
      if (cancelled) return
      const open = async (url: string) => {
        const path = appUrlToPath(url, window.location.origin)
        if (!path) return
        // Inloggningsfönstret (systemwebbläsaren) stängs när appen tar över.
        if (path.startsWith("/auth/")) await Browser.close().catch(() => {})
        window.location.assign(path)
      }
      const sub = await App.addListener("appUrlOpen", ({ url }) => void open(url))
      removers.push(() => void sub.remove())

      const onClick = (e: MouseEvent) => {
        const url = externalLink(e)
        if (!url) return
        e.preventDefault()
        void Browser.open({ url, presentationStyle: "popover" })
      }
      document.addEventListener("click", onClick, true)
      removers.push(() => document.removeEventListener("click", onClick, true))
      // Appen startades från en länk (kall start). Hanteras bara en gång – sidan
      // laddas om efter navigeringen och getLaunchUrl() ger då samma adress igen.
      const launch = await App.getLaunchUrl()
      if (launch?.url && readHandled() !== launch.url) {
        writeHandled(launch.url)
        void open(launch.url)
      }
      if (cancelled) return
      removers.push(await handlePushTap())
    })().catch(() => {
      // Ett plugin som saknas i den här app-versionen ska aldrig krascha webbappen.
    })

    return () => {
      cancelled = true
      removers.forEach((r) => r())
    }
  }, [])
  return null
}

/** Betalningen ska stanna i appens WebView (se capacitor.config.ts). */
const IN_APP_HOSTS = /(^|\.)stripe\.com$/

/** Adressen om klicket gäller en extern http(s)-länk, annars null (mailto:, tel:, interna länkar …). */
function externalLink(e: MouseEvent): string | null {
  if (e.defaultPrevented || e.button !== 0) return null
  const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
  if (!a || a.hasAttribute("download")) return null
  let url: URL
  try {
    url = new URL(a.href, window.location.href)
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  if (url.origin === window.location.origin || IN_APP_HOSTS.test(url.hostname)) return null
  return url.href
}

function readHandled() {
  try {
    return window.sessionStorage.getItem(LAUNCH_KEY)
  } catch {
    return null
  }
}

function writeHandled(url: string) {
  try {
    window.sessionStorage.setItem(LAUNCH_KEY, url)
  } catch {}
}
