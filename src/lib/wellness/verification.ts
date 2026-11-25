"use client"

/**
 * Verifiering av friskvårdsportaler (v81). Portalerna (ePassi, Benifex, Edenred)
 * saknar publik inloggning, så PT:n intygar sitt samarbetsavtal:
 *   1. leverantörs-ID eller namn i portalen,
 *   2. ett bevis (skärmdump eller avtalsbekräftelse) i den privata bucketen
 *      wellness-verifications/{uid}/…,
 *   3. ett juridiskt intygande.
 * Coavira granskar i /admin/friskvard. Publika badges och filtret i Hitta PT
 * kräver status "verified".
 */
import { getSupabase } from "@/lib/supabase/client"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import type { ID, Trainer, WellnessVerificationStatus } from "@/types/domain"

export const WELLNESS_BUCKET = "wellness-verifications"
export const PROOF_ACCEPT = "image/*,application/pdf"
export const PROOF_MAX_BYTES = 10 * 1024 * 1024
const PROOF_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"]

export const ATTESTATION_TEXT =
  "Jag intygar att mitt företag har ett aktivt samarbetsavtal med vald friskvårdsportal och ansvarar fullt ut för betalningar som sker där."

export interface MyVerification {
  merchantId: string
  status: Exclude<WellnessVerificationStatus, "none">
  reviewNote?: string
  portals: string[]
  submittedAt: string
}

const DEMO_KEY = "coavira:demo:wellness-verification:v1"

/** PT:n har slagit på minst en portal. */
export const hasPortals = (t: Pick<Trainer, "acceptsEpassi" | "acceptsBenifex" | "acceptsEdenred">) =>
  Boolean(t.acceptsEpassi || t.acceptsBenifex || t.acceptsEdenred)

/** Behöver PT:n skicka in (eller skicka in igen)? */
export const needsVerification = (t: Pick<Trainer, "acceptsEpassi" | "acceptsBenifex" | "acceptsEdenred" | "wellnessVerificationStatus">) =>
  hasPortals(t) && (t.wellnessVerificationStatus ?? "none") !== "verified" && t.wellnessVerificationStatus !== "pending"

export function proofError(file: File | null): string | null {
  if (!file) return "Ladda upp en skärmdump eller avtalsbekräftelse"
  if (!PROOF_TYPES.includes(file.type) && !/\.(jpe?g|png|webp|heic|pdf)$/i.test(file.name)) return "Bild (JPG, PNG, WebP, HEIC) eller PDF"
  if (file.size > PROOF_MAX_BYTES) return "Filen får vara högst 10 MB"
  return null
}

export async function fetchMyVerification(me: { id: ID }): Promise<MyVerification | null> {
  if (!isSupabaseEnabled) {
    try {
      return JSON.parse(localStorage.getItem(DEMO_KEY) ?? "null") as MyVerification | null
    } catch {
      return null
    }
  }
  const { data, error } = await getSupabase()
    .from("trainer_wellness_verifications")
    .select("wellness_merchant_id, status, review_note, portals, submitted_at")
    .eq("trainer_id", me.id)
    .maybeSingle()
  if (error || !data) return null
  const r = data as { wellness_merchant_id: string; status: MyVerification["status"]; review_note: string | null; portals: string[]; submitted_at: string }
  return { merchantId: r.wellness_merchant_id, status: r.status, reviewNote: r.review_note ?? undefined, portals: r.portals, submittedAt: r.submitted_at }
}

export interface PortalFlags {
  epassi: boolean
  benifex: boolean
  edenred: boolean
}
export const portalKeys = (p: PortalFlags) => (["epassi", "benifex", "edenred"] as const).filter((k) => p[k])

/**
 * Sparar portalerna direkt (inte via kön) före inskicket, så att databasen
 * granskar exakt de portaler som visas.
 */
async function persistPortals(me: { id: ID }, p: PortalFlags): Promise<string | null> {
  const { error } = await getSupabase()
    .from("trainers")
    .update({ accepts_epassi: p.epassi, accepts_benifex: p.benifex, accepts_edenred: p.edenred })
    .eq("id", me.id)
  return error ? error.message : null
}

/** Laddar upp beviset och skickar in. Ger ett felmeddelande eller null. */
export async function submitVerification(
  me: { id: ID },
  input: { merchantId: string; file: File; attested: boolean; portals: PortalFlags }
): Promise<string | null> {
  if (!portalKeys(input.portals).length) return "Välj minst en portal"
  const fileError = proofError(input.file)
  if (fileError) return fileError
  if (!input.attested) return "Intyga samarbetsavtalet för att skicka in"
  if (input.merchantId.trim().length < 2) return "Fyll i ditt leverantörs-ID eller namn i portalen"
  if (!isSupabaseEnabled) {
    const v: MyVerification = { merchantId: input.merchantId.trim(), status: "pending", portals: portalKeys(input.portals), submittedAt: new Date().toISOString() }
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(v))
    } catch {}
    return null
  }
  const sb = getSupabase()
  const portalsError = await persistPortals(me, input.portals)
  if (portalsError) return portalsError
  const ext = (input.file.name.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? (input.file.type === "application/pdf" ? "pdf" : "jpg")).toLowerCase()
  const path = `${me.id}/${Date.now()}-bevis.${ext}`
  const up = await sb.storage.from(WELLNESS_BUCKET).upload(path, input.file, { contentType: input.file.type || undefined, upsert: false })
  if (up.error) return `Filen kunde inte laddas upp: ${up.error.message}`
  const { error } = await sb.rpc("submit_wellness_verification", { p_merchant_id: input.merchantId.trim(), p_proof_path: path, p_attested: true })
  if (error) return error.message
  return null
}

// ------------------------------------------------------------------ admin ---
export interface AdminVerification {
  trainerId: ID
  trainerName: string
  merchantId: string
  proofPath: string
  attestedAt: string
  portals: string[]
  status: MyVerification["status"]
  reviewNote?: string
  submittedAt: string
}

export async function adminListVerifications(status: "pending" | "all"): Promise<AdminVerification[]> {
  const { data, error } = await getSupabase().rpc("admin_list_wellness_verifications", { p_status: status })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    trainerId: r.trainer_id as string,
    trainerName: (r.trainer_name as string) ?? "PT",
    merchantId: r.wellness_merchant_id as string,
    proofPath: r.wellness_proof_url as string,
    attestedAt: r.wellness_attested_at as string,
    portals: (r.portals as string[]) ?? [],
    status: r.status as MyVerification["status"],
    reviewNote: (r.review_note as string | null) ?? undefined,
    submittedAt: r.submitted_at as string,
  }))
}

/** Kortlivad länk till beviset (privat bucket – admin har läsrätt). */
export async function proofUrl(path: string): Promise<string | null> {
  const { data } = await getSupabase().storage.from(WELLNESS_BUCKET).createSignedUrl(path, 300)
  return data?.signedUrl ?? null
}

export async function adminReview(trainerId: ID, approve: boolean, note?: string): Promise<string | null> {
  const { error } = await getSupabase().rpc("admin_review_wellness_verification", { p_trainer: trainerId, p_approve: approve, p_note: note ?? null })
  return error ? error.message : null
}

export const PORTAL_LABEL: Record<string, string> = { epassi: "ePassi", benifex: "Benifex", edenred: "Edenred" }
