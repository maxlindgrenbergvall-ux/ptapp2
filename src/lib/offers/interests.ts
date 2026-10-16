"use client"

/**
 * Klientens intressen för PT-kategorier (Hyrox, Styrkelyft, Viktminskning …),
 * härledda ur vad klienten tittat på och sökt efter i appen.
 *
 * Integritet: historiken sparas BARA lokalt på enheten (localStorage) och
 * skickas aldrig till servern. Klienten kan stänga av personliga erbjudanden,
 * vilket också raderar historiken. Matchningen mot erbjudanden sker i appen.
 */
import * as React from "react"

import { SPECIALTIES, SPECIALTY_LABEL, type ID, type Specialty, type TrainerOffer } from "@/types/domain"

/** Hur starkt en signal väger. Ett aktivt filterval säger mer än en profil man råkat öppna. */
export const SIGNAL_WEIGHT = {
  filter: 3,
  search: 2,
  offer: 2,
  profile: 1,
} as const
export type InterestSignal = keyof typeof SIGNAL_WEIGHT

interface InterestEvent {
  c: Specialty
  w: number
  /** Tidpunkt (ms). */
  t: number
}
interface InterestState {
  enabled: boolean
  events: InterestEvent[]
  dismissed: ID[]
  seen: ID[]
}

const MAX_EVENTS = 300
/** Intresset halveras på två veckor, så gamla sökningar väger allt mindre. */
const HALF_LIFE_MS = 14 * 86_400_000
const key = (uid: string) => `coavira:interests:v1:${uid}`
const EMPTY: InterestState = { enabled: true, events: [], dismissed: [], seen: [] }

// --------------------------------------------------------------- lagring ---

const cache = new Map<string, InterestState>()
const listeners = new Set<() => void>()

function read(uid: string): InterestState {
  const hit = cache.get(uid)
  if (hit) return hit
  let state = EMPTY
  try {
    const raw = window.localStorage.getItem(key(uid))
    if (raw) {
      const p = JSON.parse(raw) as Partial<InterestState>
      state = {
        enabled: p.enabled !== false,
        events: Array.isArray(p.events) ? p.events.filter((e) => SPECIALTIES.includes(e.c)) : [],
        dismissed: Array.isArray(p.dismissed) ? p.dismissed : [],
        seen: Array.isArray(p.seen) ? p.seen : [],
      }
    }
  } catch {}
  cache.set(uid, state)
  return state
}

function write(uid: string, next: InterestState) {
  cache.set(uid, next)
  try {
    window.localStorage.setItem(key(uid), JSON.stringify(next))
  } catch {}
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith("coavira:interests:")) {
      cache.clear()
      listener()
    }
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", onStorage)
  }
}

/** Raderar historiken helt (utloggning/radering av konto, t.ex. på en delad enhet). */
export function forgetInterests(uid: string) {
  cache.delete(uid)
  try {
    window.localStorage.removeItem(key(uid))
  } catch {}
  listeners.forEach((l) => l())
}

// ------------------------------------------------------------- signaler ---

/** Registrera att klienten visat intresse för en eller flera kategorier. */
export function recordInterest(uid: string, categories: readonly Specialty[], signal: InterestSignal) {
  const state = read(uid)
  if (!state.enabled || categories.length === 0) return
  const t = Date.now()
  const w = SIGNAL_WEIGHT[signal]
  const events = [...state.events, ...categories.map((c) => ({ c, w, t }))].slice(-MAX_EVENTS)
  write(uid, { ...state, events })
}

/** Kategorier som nämns i en fritextsökning ("hyrox stockholm" → hyrox). */
export function categoriesInText(text: string): Specialty[] {
  const q = fold(text)
  if (q.length < 3) return []
  return SPECIALTIES.filter((s) => {
    const label = fold(SPECIALTY_LABEL[s])
    return q.split(/\s+/).some((word) => word.length >= 3 && (label.startsWith(word) || word.startsWith(label) || fold(s).startsWith(word)))
  })
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()

// --------------------------------------------------------------- poäng ---

export interface InterestScore {
  category: Specialty
  score: number
}

/** Summan av signaler per kategori, med exponentiellt avtagande vikt över tid. */
export function interestScores(events: InterestEvent[], now = Date.now()): InterestScore[] {
  const sum = new Map<Specialty, number>()
  for (const e of events) {
    const decay = Math.pow(0.5, Math.max(0, now - e.t) / HALF_LIFE_MS)
    sum.set(e.c, (sum.get(e.c) ?? 0) + e.w * decay)
  }
  return [...sum.entries()]
    .map(([category, score]) => ({ category, score }))
    .filter((s) => s.score >= 0.5)
    .sort((a, b) => b.score - a.score)
}

/**
 * Erbjudanden som passar klienten: aktiva och giltiga, i en kategori klienten
 * visat intresse för, inte bortvalda. Rangordnas efter intresse, sedan rabatt
 * och nyhet. Högst `limit` st och högst ett per PT, så att en PT inte tar över listan.
 */
export function matchOffers(
  offers: TrainerOffer[],
  scores: InterestScore[],
  opts: { dismissed?: ID[]; today: string; limit?: number; excludeTrainerIds?: ID[] }
): (TrainerOffer & { score: number })[] {
  const byCategory = new Map(scores.map((s) => [s.category, s.score]))
  const dismissed = new Set(opts.dismissed ?? [])
  const excluded = new Set(opts.excludeTrainerIds ?? [])
  const ranked = offers
    .filter((o) => o.active && (!o.validUntil || o.validUntil >= opts.today) && !dismissed.has(o.id) && !excluded.has(o.trainerId))
    .map((o) => ({ ...o, score: byCategory.get(o.category) ?? 0 }))
    .filter((o) => o.score > 0)
    .sort((a, b) => b.score - a.score || (b.discountPercent ?? 0) - (a.discountPercent ?? 0) || b.createdAt.localeCompare(a.createdAt))
  const perTrainer = new Set<ID>()
  const out: (TrainerOffer & { score: number })[] = []
  for (const o of ranked) {
    if (perTrainer.has(o.trainerId)) continue
    perTrainer.add(o.trainerId)
    out.push(o)
    if (out.length >= (opts.limit ?? 3)) break
  }
  return out
}

// ----------------------------------------------------------------- hook ---

export function useInterests(uid: string) {
  const state = React.useSyncExternalStore(
    subscribe,
    () => read(uid),
    () => EMPTY
  )
  return React.useMemo(
    () => ({
      enabled: state.enabled,
      scores: state.enabled ? interestScores(state.events) : [],
      dismissed: state.dismissed,
      seen: state.seen,
      record: (categories: readonly Specialty[], signal: InterestSignal) => recordInterest(uid, categories, signal),
      dismiss: (offerId: ID) => {
        const s = read(uid)
        write(uid, { ...s, dismissed: [...new Set([...s.dismissed, offerId])].slice(-200) })
      },
      markSeen: (offerIds: ID[]) => {
        const s = read(uid)
        if (offerIds.every((id) => s.seen.includes(id))) return
        write(uid, { ...s, seen: [...new Set([...s.seen, ...offerIds])].slice(-200) })
      },
      /** Av = inga personliga erbjudanden och historiken raderas. */
      setEnabled: (enabled: boolean) => write(uid, enabled ? { ...read(uid), enabled } : { ...EMPTY, enabled: false }),
      clear: () => write(uid, { ...read(uid), events: [] }),
    }),
    [state, uid]
  )
}
