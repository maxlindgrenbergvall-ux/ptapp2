"use client"

import * as React from "react"

import { appUrlToPath, isNativeApp } from "@/lib/native/app"
import { handlePushTap } from "@/lib/native/push"

const LAUNCH_KEY = "coavira:launch-url-handled"

/**
 * Kopplar ihop webbappen med den native appen (bara i appen; gör ingenting på
 * webben):
 *  - Djuplänkar (com.coavira.app://… och appens https-länkar) öppnar rätt sida.
 *    Inloggning med Apple/Google kommer tillbaka hit med en engångskod som
 *    växlas mot en session på /auth/callback, i appens egen WebView.
 *  - Tryck på en push-notis öppnar sidan notisen gäller.
 */
export function NativeBridge() {
  React.useEffect(() => {
    if (!isNativeApp()) return
    let cancelled = false
    const removers: (() => void)[] = []

    void (async () => {
      const [{ App }, { Browser }] = await Promise.all([import("@capacitor/app"), import("@capacitor/browser")])
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
      // Appen startades från en länk (kall start). Hanteras bara en gång – sidan
      // laddas om efter navigeringen och getLaunchUrl() ger då samma adress igen.
      const launch = await App.getLaunchUrl()
      if (launch?.url && readHandled() !== launch.url) {
        writeHandled(launch.url)
        void open(launch.url)
      }
      if (cancelled) return
      removers.push(await handlePushTap())
    })()

    return () => {
      cancelled = true
      removers.forEach((r) => r())
    }
  }, [])
  return null
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
