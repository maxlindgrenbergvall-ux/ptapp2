"use client"

/**
 * Kontostatus, uppdaterat användaravtal och rapporter (v65).
 *
 * Databasen avgör allt (my_account_status, accept_legal_documents, content_reports
 * med RLS). I demoläget finns inga avstängningar och rapporter bekräftas bara.
 */
import { AGREEMENT_PARTS } from "@/lib/onboarding"
import { getSupabase } from "@/lib/supabase/client"
import { isSupabaseEnabled } from "@/lib/supabase/config"

export interface AccountAction {
  action: "warning" | "suspend" | "lift"
  reason: string
  until: string | null
  at: string
}

export interface AccountStatus {
  suspended: boolean
  suspended_until: string | null
  suspension_reason: string | null
  actions: AccountAction[]
}

export const REPORT_CATEGORIES = [
  { value: "sexual", label: "Sexuellt innehåll eller nakenhet" },
  { value: "harassment", label: "Trakasserier, hot eller kränkningar" },
  { value: "hate", label: "Hat eller diskriminering" },
  { value: "violence", label: "Våld" },
  { value: "self_harm", label: "Självskada, ätstörningar eller farliga metoder" },
  { value: "scam", label: "Bedrägeri eller betalning utanför appen" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Något annat" },
] as const
export type ReportCategory = (typeof REPORT_CATEGORIES)[number]["value"]

const fail = (message: string | undefined) => new Error(message || "Något gick fel. Försök igen.")

/** Avstängning och senaste åtgärder. null i demoläget eller utan inloggning. */
export async function fetchAccountStatus(): Promise<AccountStatus | null> {
  if (!isSupabaseEnabled) return null
  const { data, error } = await getSupabase().rpc("my_account_status")
  if (error) throw fail(error.message)
  return (data as AccountStatus | null) ?? null
}

/** Befintliga användare godkänner det uppdaterade avtalet (alla delar för rollen, nuvarande version). */
export async function acceptUpdatedAgreement(role: "client" | "trainer"): Promise<void> {
  if (!isSupabaseEnabled) return
  const { error } = await getSupabase().rpc("accept_legal_documents", { p_documents: AGREEMENT_PARTS[role] })
  if (error) throw fail(error.message)
}

/** Rapportera ett meddelande (eller en användare) till Coavira. Granskas manuellt. */
export async function reportContent(input: { reportedUserId: string; messageId?: string; category: ReportCategory; details?: string }): Promise<void> {
  if (!isSupabaseEnabled) return
  const { error } = await getSupabase()
    .from("content_reports")
    .insert({
      reported_user_id: input.reportedUserId,
      message_id: input.messageId ?? null,
      category: input.category,
      details: input.details?.trim() || null,
    })
  if (error) {
    throw fail(/row-level security/i.test(error.message) ? "Rapporten kunde inte skickas. Kontakta kontakt@coavira.fit." : error.message)
  }
}
