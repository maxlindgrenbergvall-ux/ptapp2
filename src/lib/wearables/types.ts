/**
 * Gemensam modell för sömndata från wearables. Varje leverantör har en adapter
 * som översätter till den här formen; resten av appen känner inte till Fitbit,
 * Apple Health eller Google Fit.
 */
import type { SleepStages, WearableProvider } from "@/types/domain"

export interface SleepRecord {
  /** Datum man vaknade (YYYY-MM-DD). */
  date: string
  hours: number
  stages?: SleepStages
  /** 0–100. Leverantörens egen poäng om den finns, annars beräknad (se sleep-score.ts). */
  sleepScore?: number
  externalId?: string
}

export interface TokenSet {
  accessToken: string
  refreshToken?: string
  expiresAt?: string
  scope?: string[]
  externalUserId: string
}

export interface WearableAdapter {
  provider: WearableProvider
  /** false = inga API-nycklar; mock-adaptern används i stället. */
  configured: boolean
  authorizeUrl(state: string, redirectUri: string): string
  exchangeCode(code: string, redirectUri: string): Promise<TokenSet>
  refresh(tokens: TokenSet): Promise<TokenSet>
  fetchSleep(tokens: TokenSet, from: string, to: string): Promise<SleepRecord[]>
}

export const PROVIDER_LABEL: Record<WearableProvider, string> = {
  fitbit: "Fitbit",
  apple_health: "Apple Health",
  google_fit: "Google Fit / Health Connect",
}
