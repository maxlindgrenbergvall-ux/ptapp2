/**
 * Obligatorisk PT-onboarding (v22): samma regler som databasen
 * (trainer_profile_complete), så att formuläret visar exakt vad som saknas.
 */
import type { Specialty } from "@/types/domain"

export const MIN_BIO_LENGTH = 40

export interface OnboardingProfile {
  name: string
  bio: string
  specialties: Specialty[]
  avatarUrl: string
}

/** Det som saknas för en färdig profil (tom lista = klar). */
export function missingProfileParts(p: OnboardingProfile): string[] {
  return [
    p.name.trim().length < 2 && "namn",
    !p.avatarUrl && "profilbild",
    p.specialties.length === 0 && "minst en inriktning",
    p.bio.trim().length < MIN_BIO_LENGTH && `en presentation (minst ${MIN_BIO_LENGTH} tecken)`,
  ].filter(Boolean) as string[]
}

/** Status från databasen (my_payout_status). */
export interface PayoutStatus {
  profile_complete: boolean
  stripe_onboarding_complete: boolean
  connected: boolean
  details_submitted: boolean
  charges_enabled: boolean
  payouts_enabled: boolean
  requirements_due: number
  exempt: boolean
  pt_ready: boolean
}
