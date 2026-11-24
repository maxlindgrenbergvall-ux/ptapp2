"use client"

/**
 * Friskvård mot servern (v75) – och samma regler i demoläget.
 *
 * Företagsuppgifterna (privata: organisationsnumret kan vara ett personnummer),
 * portalinstruktionerna och kvittona hämtas direkt från databasen när de behövs
 * i stället för att ligga i appens delade data. RLS och funktionerna i migration
 * v75 avgör vem som får se vad.
 */
import { checkoutTotals, feePercentFor } from "@/lib/payments/fees"
import { getSupabase } from "@/lib/supabase/client"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import { isValidOrgNumber, normalizeOrgNumber } from "@/lib/wellness/identity"
import { receiptFromRpc, type WellnessReceipt } from "@/lib/wellness/receipt"
import type { AppData, ID, Trainer } from "@/types/domain"

export interface TrainerBusiness {
  companyName: string
  orgNumber: string
  companyAddress: string
  vatRegistered: boolean
  wellnessInstructions: string
}

export const EMPTY_BUSINESS: TrainerBusiness = { companyName: "", orgNumber: "", companyAddress: "", vatRegistered: true, wellnessInstructions: "" }

export const isBusinessComplete = (b: TrainerBusiness | null | undefined) =>
  Boolean(b && b.companyName.trim() && isValidOrgNumber(b.orgNumber) && b.companyAddress.trim())

// ----------------------------------------------------------------- demo ---
const DEMO_KEY = "coavira:demo:business:v1"

/** Påhittade uppgifter för demokonton (märkta "demo") så att kvitton går att prova. */
const demoDefault = (trainer?: Pick<Trainer, "name">): TrainerBusiness => ({
  companyName: `${trainer?.name ?? "PT"} Träning (demo)`,
  orgNumber: "559123-4561",
  companyAddress: "Exempelgatan 1, 111 11 Stockholm",
  vatRegistered: true,
  wellnessInstructions: `Sök på "${trainer?.name ?? "PT"}" i ePassi eller Benifex och välj personlig träning.`,
})

function demoAll(): Record<string, TrainerBusiness> {
  try {
    return JSON.parse(localStorage.getItem(DEMO_KEY) ?? "{}") as Record<string, TrainerBusiness>
  } catch {
    return {}
  }
}
const demoGet = (trainerId: ID, trainer?: Pick<Trainer, "name">) => demoAll()[trainerId] ?? demoDefault(trainer)

// ---------------------------------------------------------- uppgifterna ---
export async function fetchMyBusiness(me: { id: ID; name: string }): Promise<TrainerBusiness> {
  if (!isSupabaseEnabled) return demoGet(me.id, me)
  const { data, error } = await getSupabase().from("trainer_business").select("*").eq("trainer_id", me.id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return { ...EMPTY_BUSINESS }
  return {
    companyName: data.company_name ?? "",
    orgNumber: data.org_number ?? "",
    companyAddress: data.company_address ?? "",
    vatRegistered: data.vat_registered !== false,
    wellnessInstructions: data.wellness_instructions ?? "",
  }
}

/** Sparar och returnerar ett felmeddelande (eller null). */
export async function saveMyBusiness(me: { id: ID }, b: TrainerBusiness): Promise<string | null> {
  const org = b.orgNumber.trim()
  if (org && !isValidOrgNumber(org)) return "Organisationsnumret är inte giltigt – kontrollera siffrorna."
  const clean: TrainerBusiness = {
    companyName: b.companyName.trim().slice(0, 120),
    orgNumber: org ? normalizeOrgNumber(org)! : "",
    companyAddress: b.companyAddress.trim().slice(0, 200),
    vatRegistered: b.vatRegistered,
    wellnessInstructions: b.wellnessInstructions.trim().slice(0, 600),
  }
  if (!isSupabaseEnabled) {
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify({ ...demoAll(), [me.id]: clean }))
    } catch {}
    return null
  }
  const { error } = await getSupabase()
    .from("trainer_business")
    .upsert({
      trainer_id: me.id,
      company_name: clean.companyName,
      org_number: clean.orgNumber || null,
      company_address: clean.companyAddress,
      vat_registered: clean.vatRegistered,
      wellness_instructions: clean.wellnessInstructions,
    })
  return error ? error.message : null
}

// -------------------------------------------------- före första köpet ---
/**
 * Får klienten och PT:n dela kontaktuppgifter och betala utanför appen? Samma
 * regel som offplatform_unlocked() i databasen: PT:ns egen klient
 * (inbjudningslänk), extern friskvård eller ett betalt köp hos PT:n.
 */
export function isOffplatformUnlocked(data: AppData, clientId: ID, trainerId: ID): boolean {
  const rel = data.relationships.find((r) => r.clientId === clientId && r.trainerId === trainerId)
  if (rel?.acquisition === "EXISTING_CLIENT" || rel?.paymentSource === "external_wellness") return true
  return data.purchases.some((p) => p.clientId === clientId && p.trainerId === trainerId && p.status === "paid")
}

/** PT:ns sökinstruktioner i portalerna – null före första köpet. */
export async function fetchWellnessInstructions(data: AppData, me: { id: ID }, trainerId: ID): Promise<string | null> {
  if (!isSupabaseEnabled) {
    if (!isOffplatformUnlocked(data, me.id, trainerId)) return null
    return demoGet(trainerId, data.trainers.find((t) => t.id === trainerId)).wellnessInstructions || null
  }
  const { data: text, error } = await getSupabase().rpc("trainer_wellness_instructions", { p_trainer: trainerId })
  if (error) return null
  return (text as string | null) || null
}

// --------------------------------------------------------------- kvitton ---
/** Betalda kassor (en rad per betalning) – nyast först. Gamla pass före betalning i appen räknas inte. */
export function paidCheckouts(data: AppData, filter: { clientId?: ID; trainerId?: ID }) {
  const map = new Map<ID, { checkoutId: ID; trainerId: ID; clientId: ID; paidAt: string; subtotalSek: number; titles: string[]; wellness: boolean }>()
  for (const p of data.purchases) {
    if (p.status !== "paid" || p.kind === "legacy" || p.priceSek <= 0) continue
    if (filter.clientId && p.clientId !== filter.clientId) continue
    if (filter.trainerId && p.trainerId !== filter.trainerId) continue
    const c = map.get(p.checkoutId) ?? { checkoutId: p.checkoutId, trainerId: p.trainerId, clientId: p.clientId, paidAt: p.paidAt ?? p.createdAt, subtotalSek: 0, titles: [], wellness: false }
    c.subtotalSek += p.priceSek
    c.titles.push(p.title)
    c.wellness ||= Boolean(data.services.find((s) => s.id === p.serviceId)?.isWellnessPackage)
    if ((p.paidAt ?? "") > c.paidAt) c.paidAt = p.paidAt!
    map.set(p.checkoutId, c)
  }
  return [...map.values()].sort((a, b) => b.paidAt.localeCompare(a.paidAt))
}

export async function fetchReceipt(data: AppData, checkoutId: ID): Promise<WellnessReceipt> {
  if (isSupabaseEnabled) {
    const { data: r, error } = await getSupabase().rpc("get_wellness_receipt", { p_checkout: checkoutId })
    if (error) throw new Error(error.message)
    return receiptFromRpc(r as Record<string, unknown>)
  }
  // Demoläget: samma innehåll räknat ur demodatan.
  const lines = data.purchases.filter((p) => p.checkoutId === checkoutId && p.status === "paid")
  if (!lines.length) throw new Error("Kvittot finns inte")
  const first = lines[0]
  const all = paidCheckouts(data, {}).reverse()
  const no = all.findIndex((c) => c.checkoutId === checkoutId) + 1
  const paidAt = lines.reduce((m, p) => ((p.paidAt ?? p.createdAt) > m ? (p.paidAt ?? p.createdAt) : m), first.paidAt ?? first.createdAt)
  const trainer = data.trainers.find((t) => t.id === first.trainerId)
  const b = demoGet(first.trainerId, trainer)
  const subtotal = lines.reduce((s, p) => s + p.priceSek, 0)
  const acquisition = data.relationships.find((r) => r.clientId === first.clientId && r.trainerId === first.trainerId)?.acquisition
  const totals = checkoutTotals(subtotal, feePercentFor(acquisition))
  const buyer = data.clients.find((c) => c.id === first.clientId)?.name ?? ""
  return {
    checkoutId,
    receiptNumber: `CV-${paidAt.slice(0, 4)}-${String(Math.max(1, no)).padStart(6, "0")}`,
    paidAt,
    buyerName: buyer,
    seller: {
      name: trainer?.name ?? "PT",
      companyName: b.companyName,
      orgNumber: b.orgNumber || null,
      companyAddress: b.companyAddress,
      vatRegistered: b.vatRegistered,
      complete: isBusinessComplete(b),
    },
    lines: lines.map((p) => ({
      title: p.title,
      quantity: p.quantity ?? 1,
      unitPriceSek: p.priceSek / (p.quantity ?? 1),
      priceSek: p.priceSek,
      isWellnessPackage: Boolean(data.services.find((s) => s.id === p.serviceId)?.isWellnessPackage),
    })),
    subtotalSek: subtotal,
    serviceFeeSek: totals.serviceFeeSek,
    totalSek: totals.totalSek,
    vatRate: b.vatRegistered ? 6 : 0,
  }
}
