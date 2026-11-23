"use client"

/**
 * Överlämning från inloggningen till appen (v71).
 *
 * Direkt efter inloggningen hämtas användarens data medan laddningsskärmen
 * snurrar. Datan läggs i samma lokala cache som offlinestarten använder, och en
 * kort markering i sessionStorage säger att den är färsk. När appen sedan laddas
 * (hel sidladdning, så att servern ser sessionscookien) visas datan direkt –
 * ingen ny väntan. Markeringen gäller en gång och i högst 30 sekunder.
 */
import type { AppData, Me } from "@/types/domain"

export const cacheKey = (uid: string) => `coavira:cache:v1:${uid}`
const HANDOFF_KEY = "coavira:handoff"
const MAX_AGE_MS = 30_000

/** Spara datan som hämtades vid inloggningen. */
export function writeHandoff(me: Me, data: AppData) {
  try {
    window.localStorage.setItem(cacheKey(me.id), JSON.stringify({ me, data }))
    window.sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ uid: me.id, at: Date.now() }))
  } catch {}
}

/** Användar-id om en färsk överlämning finns (och förbruka den). */
export function takeHandoff(): string | null {
  try {
    const raw = window.sessionStorage.getItem(HANDOFF_KEY)
    if (!raw) return null
    window.sessionStorage.removeItem(HANDOFF_KEY)
    const { uid, at } = JSON.parse(raw) as { uid?: string; at?: number }
    return uid && at && Date.now() - at < MAX_AGE_MS ? uid : null
  } catch {
    return null
  }
}

/**
 * Hämta appens data direkt efter inloggningen (bakom laddningsskärmen) och lämna
 * över den till appen. Misslyckas något, eller tar det för lång tid, laddar
 * appen själv som vanligt – inloggningen stoppas aldrig av förladdningen.
 */
export async function prepareAppData(timeoutMs = 10_000): Promise<void> {
  const work = (async () => {
    const [{ getSupabase }, { loadRemote }] = await Promise.all([import("@/lib/supabase/client"), import("@/lib/data/supabase-source")])
    const loaded = await loadRemote(getSupabase())
    writeHandoff(loaded.me, loaded.data)
  })().catch(() => {})
  await Promise.race([work, new Promise((r) => setTimeout(r, timeoutMs))])
}
