"use client"

/**
 * Startskärmen över inloggningen i mobilappen (v71). Medan Coavira-loggan snurrar
 * förladdas appens kod (klient- och PT-appen och datalagret), så att allt är
 * klart när man loggar in. Visas en gång per appstart och bara i mobilappen –
 * på webben ser man inloggningen direkt.
 */
import { useRouter } from "next/navigation"
import * as React from "react"

import { BootSplash } from "@/components/boot-splash"
import { isSupabaseEnabled } from "@/lib/supabase/config"

const MIN_MS = 600
const MAX_MS = 3000

export function StartSplash() {
  const router = useRouter()
  const [ready, setReady] = React.useState(false)
  React.useEffect(() => {
    // Bara i mobilappen och en gång per appstart (klasserna sätts i <head>) – annars inget att förladda.
    const html = document.documentElement
    if (!html.classList.contains("native-app") || html.classList.contains("app-started")) return
    let alive = true
    // Appens sidor och moduler hamnar i webbläsarens cache, så att appen öppnas direkt efter inloggningen.
    router.prefetch("/klient")
    router.prefetch("/pt")
    const warm: Promise<unknown>[] = [
      document.fonts?.ready ?? Promise.resolve(),
      import("@/lib/data/store").catch(() => {}),
      new Promise((r) => setTimeout(r, MIN_MS)),
    ]
    if (isSupabaseEnabled) warm.push(import("@/lib/data/supabase-source").catch(() => {}))
    // Aldrig längre än tre sekunder – inloggningen ska inte vänta på förladdningen.
    void Promise.race([Promise.all(warm), new Promise((r) => setTimeout(r, MAX_MS))]).then(() => {
      if (alive) setReady(true)
    })
    return () => {
      alive = false
    }
  }, [router])
  return <BootSplash ready={ready} mode="start" />
}
