/**
 * Mock-wearable: realistisk sömndata utan riktig enhet. Används i demoläget och
 * när inga API-nycklar är konfigurerade, så att hela flödet (anslut → synka →
 * visa) kan testas. Deterministisk per datum så att synk två gånger ger samma natt.
 */
import { addDays } from "@/lib/date"
import { estimateSleepScore } from "@/lib/wearables/sleep-score"
import type { SleepRecord, TokenSet, WearableAdapter } from "@/lib/wearables/types"
import type { WearableProvider } from "@/types/domain"

function seeded(date: string) {
  let h = 2166136261
  for (const c of date) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

export function mockSleepFor(date: string): SleepRecord {
  const r = seeded(date)
  const hours = Math.round((6 + r() * 2.6) * 10) / 10
  const total = Math.round(hours * 60)
  const deep = Math.round(total * (0.12 + r() * 0.08))
  const rem = Math.round(total * (0.17 + r() * 0.07))
  const awake = Math.round(15 + r() * 35)
  const stages = { deep, rem, awake, light: Math.max(0, total - deep - rem) }
  return { date, hours, stages, sleepScore: estimateSleepScore(hours, stages), externalId: `mock-${date}` }
}

export function mockSleepRange(from: string, to: string): SleepRecord[] {
  const out: SleepRecord[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(mockSleepFor(d))
  return out
}

export function mockAdapter(provider: WearableProvider): WearableAdapter {
  return {
    provider,
    configured: false,
    authorizeUrl: () => "",
    exchangeCode: async (): Promise<TokenSet> => ({ accessToken: "mock", externalUserId: `mock-${provider}` }),
    refresh: async (t) => t,
    fetchSleep: async (_t, from, to) => mockSleepRange(from, to),
  }
}
