import "server-only"

import { visibleText, contactLinks } from "@/lib/crm/extract"
import { FetchError, fetchPublicPage } from "@/lib/crm/fetch-public"
import { searchConfigured, webSearch } from "@/lib/crm/search"
import type { CrmStore } from "@/lib/crm/store"
import type { EnrichmentResult, Lead, ServerLeadPatch } from "@/lib/crm/types"
import { bolagsverketConfigured, lookupOrgNumber } from "@/lib/crm/enrichment/bolagsverket"
import { decide, SURE, type Evidence } from "@/lib/crm/enrichment/decide"
import { redactPersonnummer } from "@/lib/crm/enrichment/orgnr"
import { fromLead, fromSearch, fromText, searchQuery } from "@/lib/crm/enrichment/signals"

/**
 * Berikningsmotorn (v54): avgör bolagstyp och roll för en lead och kopplar
 * den till rätt regelverk – helt automatiskt.
 *
 * Källor, i ordning (en källa hoppas över när svaret redan är säkert):
 *   1. Leadens egna fält: gymkedjans e-postdomän, gym, segment, följare, org.nr.
 *   2. Egen webbplats (leadens adress, annars e-postens domän om den inte är en
 *      gratistjänst): startsidan och kontakt-/om-sidan – samma hänsynsfulla
 *      hämtning som tidigare (robots.txt, paus mellan anrop, inga interna adresser).
 *   3. Sök-API:t (Brave): företagsregistrens EGNA utdrag (allabolag, merinfo …)
 *      för "Förnamn Efternamn" + ort. Inga registersidor hämtas eller skrapas.
 *   4. Bolagsverket: bekräftar ett hittat organisationsnummer (aktivt aktiebolag).
 *
 * Personnummer: känns igen som en signal för enskild firma men sparas aldrig –
 * varken i fälten, i bevisen eller i loggar.
 */

const FREE_MAIL = /^(gmail|googlemail|hotmail|outlook|live|icloud|me|mac|yahoo|msn|telia|spray|bredband|bahnhof|comhem|tele2|proton|protonmail|pm)\.[a-z.]+$/i

export interface EnrichOptions {
  /** Senast klockslag (ms) – källor som inte hinns med hoppas över. */
  deadline?: number
  /** Webbplatsen lästes nyss (leaden lades till från en webbsida) – läs den inte igen. */
  skipWebsite?: boolean
  /**
   * v55: källor som kostar per anrop (sök-API:t) körs BARA när någon klickar.
   * Automatiska körningar (ny lead, ändring, "Auto-berika nya") använder bara
   * gratis källor: leadens fält, webbplatsen och Bolagsverket.
   */
  paid?: boolean
  now?: () => Date
}

async function websiteEvidence(url: string, deadline: number, skipped: string[]): Promise<Evidence[]> {
  if (Date.now() > deadline - 2500) return (skipped.push("Webbplatsen: tiden räckte inte"), [])
  try {
    const page = await fetchPublicPage(url)
    let text = visibleText(page.html)
    // Organisationsnumret står ofta i sidfoten eller på kontakt-/om-sidan.
    const next = contactLinks(page.html, page.url)[0]
    if (next && Date.now() < deadline - 2500) {
      try {
        text += `\n${visibleText((await fetchPublicPage(next)).html)}`
      } catch {
        // Kontaktsidan är en bonus – startsidan räcker.
      }
    }
    return fromText(text, "website", page.url)
  } catch (e) {
    skipped.push(`Webbplatsen: ${e instanceof FetchError ? e.message : "kunde inte läsas"}`)
    return []
  }
}

/** Kör motorn för en lead och sparar resultatet. Returnerar den uppdaterade leaden. */
export async function enrichLead(store: CrmStore, leadId: string, opts: EnrichOptions = {}): Promise<Lead | null> {
  const now = opts.now ?? (() => new Date())
  const deadline = opts.deadline ?? Date.now() + 9000
  const lead = await store.getLead(leadId)
  if (!lead) return null
  // En bolagstyp som satts för hand ändras aldrig av motorn.
  if (lead.companyTypeManual) return lead
  await store.updateLead(lead.id, { enrichmentStatus: "running" })

  const skipped: string[] = []
  try {
    const evidence: Evidence[] = fromLead(lead)
    const sure = () => evidence.some((e) => e.weight >= SURE && (e.kind === "gym_email" || (e.kind === "ab" && e.orgNumber) || e.kind === "enskild"))

    // 2. Egen webbplats.
    if (opts.skipWebsite) skipped.push("Webbplatsen: lästes nyss när leaden lades till")
    else if (!evidence.some((e) => e.kind === "gym_email")) {
      const domain = lead.email?.split("@")[1]?.toLowerCase()
      const site = lead.websiteUrl ?? (domain && !FREE_MAIL.test(domain) ? `https://${domain}` : null)
      if (site) evidence.push(...(await websiteEvidence(site, deadline, skipped)))
    }

    // 3. Företagsregistrens utdrag via sök-API:t.
    if (!sure() && lead.name.trim().split(/\s+/).length >= 2) {
      if (!opts.paid) skipped.push("Sökningen i företagsregister: körs bara när du klickar (kostar en sökning)")
      else if (!searchConfigured()) skipped.push("Sökningen: inte konfigurerad (BRAVE_SEARCH_API_KEY)")
      else if (Date.now() > deadline - 2000) skipped.push("Sökningen: tiden räckte inte")
      else {
        try {
          const results = (await webSearch(searchQuery(lead), 10)).map((r) => ({ title: r.title ?? "", url: r.url ?? "", snippet: (r.description ?? "").replace(/<[^>]+>/g, "") }))
          evidence.push(...fromSearch(results.filter((r) => r.url), lead))
        } catch (e) {
          skipped.push(`Sökningen: ${e instanceof Error ? e.message : "fel"}`)
        }
      }
    }

    // 4. Bolagsverket bekräftar det starkaste organisationsnumret.
    const candidate = evidence.filter((e) => e.kind === "ab" && e.orgNumber).sort((a, b) => b.weight - a.weight)[0]
    if (candidate) {
      if (!bolagsverketConfigured()) skipped.push("Bolagsverket: inte konfigurerat (BOLAGSVERKET_CLIENT_ID)")
      else if (Date.now() > deadline - 1500) skipped.push("Bolagsverket: tiden räckte inte")
      else {
        try {
          const answer = await lookupOrgNumber(candidate.orgNumber!)
          if (!answer) skipped.push(`Bolagsverket: inget besked om ${candidate.orgNumber}`)
          else if (answer.inactive) evidence.push({ source: "bolagsverket", kind: "inactive", weight: 95, detail: `${candidate.orgNumber} är avregistrerat`, orgNumber: candidate.orgNumber })
          else if (answer.isAktiebolag) evidence.push({ source: "bolagsverket", kind: "ab", weight: Math.min(99, Math.max(92, candidate.weight + 15)), detail: `Aktivt aktiebolag${answer.name ? `: ${answer.name}` : ""} (${candidate.orgNumber})`, orgNumber: candidate.orgNumber, verified: true })
          else skipped.push(`Bolagsverket: ${candidate.orgNumber} är ${answer.form ?? "inte ett aktiebolag"}`)
        } catch (e) {
          skipped.push(`Bolagsverket: ${e instanceof Error ? e.message : "fel"}`)
        }
      }
    }

    // Inga personnummer i det som sparas – bara en spärr till (bevisen innehåller dem aldrig).
    const clean = evidence.map((e) => ({ ...e, detail: redactPersonnummer(e.detail).slice(0, 200) }))
    const d = decide(clean, lead)
    const result: EnrichmentResult = { evidence: clean.slice(0, 20), confidence: d.confidence, summary: d.summary, skipped }
    const patch: ServerLeadPatch = {
      companyType: d.type,
      companyForm: d.companyForm,
      orgNumber: d.companyForm === "ab" ? (d.orgNumber ?? lead.orgNumber) : null,
      enrichmentStatus: d.status,
      enrichment: result,
      enrichedAt: now().toISOString(),
      verifiedAt: d.verified ? now().toISOString() : null,
      ...(d.legalBasis && lead.legalBasis !== "consent" ? { legalBasis: d.legalBasis } : {}),
    }
    return (await store.updateLead(lead.id, patch))?.lead ?? lead
  } catch (e) {
    const result: EnrichmentResult = { evidence: [], confidence: 0, summary: "Berikningen misslyckades", skipped: [...skipped, e instanceof Error ? e.message : "okänt fel"] }
    return (await store.updateLead(lead.id, { enrichmentStatus: "failed", enrichment: result, enrichedAt: now().toISOString() }))?.lead ?? lead
  }
}

/** Leads som väntar på berikning (eller fastnat i "running" i mer än två minuter). */
export function pendingLeads(leads: Lead[], now = Date.now()): Lead[] {
  return leads.filter((l) => !l.companyTypeManual && (l.enrichmentStatus === "pending" || (l.enrichmentStatus === "running" && now - new Date(l.updatedAt).getTime() > 120_000)))
}

/** Berika upp till `limit` väntande leads inom tidsgränsen (knappen "Auto-berika nya") – bara gratis källor. */
export async function enrichPending(store: CrmStore, limit = 3, budgetMs = 20_000): Promise<{ done: Lead[]; remaining: number }> {
  const start = Date.now()
  const queue = pendingLeads(await store.listLeads())
  const done: Lead[] = []
  for (const lead of queue.slice(0, limit)) {
    if (Date.now() - start > budgetMs - 4000) break
    const updated = await enrichLead(store, lead.id, { deadline: Math.min(Date.now() + 9000, start + budgetMs) })
    if (updated) done.push(updated)
  }
  return { done, remaining: Math.max(0, queue.length - done.length) }
}
