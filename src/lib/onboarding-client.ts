"use client"

/**
 * Intro-flödets anrop till databasen (v31). Alla steg sparas direkt (inte via
 * bakgrundskön), så att nästa steg vet att databasen har uppgifterna och
 * användaren får det riktiga felet om något går fel. Demoläget sparar inget här.
 */
import { goalRow } from "@/lib/data/supabase-source"
import type { LegalDocument, OnboardingStatus } from "@/lib/onboarding"
import { getSupabase } from "@/lib/supabase/client"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import type { GoalProfile } from "@/types/domain"

export class OnboardingError extends Error {}

function message(error: { code?: string; message?: string } | null): string {
  if (!error) return "Något gick fel. Försök igen."
  if (error.code === "PGRST202" || error.code === "42883" || /could not find the function/i.test(error.message ?? "")) {
    return "Databasen är inte uppdaterad: kör migrationen v31 (supabase/migrations/…_v31_onboarding_roles.sql) i Supabase."
  }
  if (/Failed to fetch|NetworkError|fetch failed/i.test(error.message ?? "")) return "Ingen uppkoppling – försök igen."
  return error.message ?? "Något gick fel. Försök igen."
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().rpc(name, args)
  if (error) throw new OnboardingError(message(error))
  return data as T
}

/** Var i flödet är användaren? null i demoläget. */
export async function fetchOnboardingStatus(): Promise<OnboardingStatus | null> {
  if (!isSupabaseEnabled) return null
  return rpc<OnboardingStatus>("my_onboarding_status")
}

/** Steg 1: förnamn, efternamn och profilbild (redan granskad av bildfiltret). */
export async function saveProfileStep(firstName: string, lastName: string, avatarUrl: string | null): Promise<OnboardingStatus | null> {
  if (!isSupabaseEnabled) return null
  return rpc<OnboardingStatus>("save_profile_step", { p_first_name: firstName.trim(), p_last_name: lastName.trim(), p_avatar_url: avatarUrl || null })
}

/** Klientens mål (v30) – sparas direkt innan finish_onboarding kontrollerar dem. */
export async function saveGoalsNow(clientId: string, profile: GoalProfile): Promise<void> {
  if (!isSupabaseEnabled) return
  const { error } = await getSupabase().from("client_goals").upsert(goalRow(clientId, profile))
  if (error) throw new OnboardingError(message(error))
}

/** PT steg 3: godkänn avtalen (nuvarande version). */
export async function acceptLegalDocuments(documents: LegalDocument[]): Promise<OnboardingStatus | null> {
  if (!isSupabaseEnabled) return null
  return rpc<OnboardingStatus>("accept_legal_documents", { p_documents: documents })
}

/**
 * Sista steget: databasen kontrollerar att rollens alla steg är klara och sätter
 * onboarding_completed. Sessionen förnyas så att JWT:n (och proxy.ts) ser flaggan.
 */
export async function finishOnboarding(): Promise<void> {
  if (!isSupabaseEnabled) return
  await rpc<OnboardingStatus>("finish_onboarding")
  await getSupabase().auth.refreshSession()
}
