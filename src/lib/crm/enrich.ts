import "server-only"

import { contactLinks, extractContacts } from "@/lib/crm/extract"
import { FetchError, fetchPublicPage } from "@/lib/crm/fetch-public"
import { hasMx } from "@/lib/crm/mx"
import { scoreLead } from "@/lib/crm/score"
import type { Extracted, LeadInput, ScorePart } from "@/lib/crm/types"

export interface Enriched {
  /** Förslag att granska: det bästa värdet per fält. */
  suggestion: LeadInput
  /** Allt som hittades (flera adresser/nummer kan finnas att välja mellan). */
  found: Extracted
  score: number
  breakdown: ScorePart[]
  /** Sidorna som lästes. */
  pages: string[]
  /** Sådant administratören bör veta (t.ex. att kontaktsidan inte fick hämtas). */
  notes: string[]
}

/**
 * Berikning från en publik sida: hämtar sidan, och om ingen e-postadress finns
 * där även EN kontakt-/om-sida på samma domän. Kontrollerar e-postdomänen (MX)
 * och räknar ut Lead Score. Ingenting sparas här.
 */
export async function enrichFromUrl(rawUrl: string): Promise<Enriched> {
  const page = await fetchPublicPage(rawUrl)
  const pages = [page.url]
  const notes: string[] = []
  let found = extractContacts(page.html, page.url)

  if (!found.emails.length || !found.phones.length) {
    const next = contactLinks(page.html, page.url)[0]
    if (next) {
      try {
        const contact = await fetchPublicPage(next)
        pages.push(contact.url)
        const more = extractContacts(contact.html, contact.url)
        found = {
          ...found,
          emails: [...new Set([...found.emails, ...more.emails])].slice(0, 5),
          phones: [...new Set([...found.phones, ...more.phones])].slice(0, 3),
          instagram: found.instagram ?? more.instagram,
          city: found.city ?? more.city,
          gym: found.gym ?? more.gym,
          specialties: [...new Set([...found.specialties, ...more.specialties])].slice(0, 6),
          isTrainer: found.isTrainer || more.isTrainer,
        }
      } catch (e) {
        notes.push(`Kontaktsidan kunde inte läsas: ${e instanceof FetchError ? e.message : "okänt fel"}`)
      }
    }
  }

  // Första adressen vars domän tar emot post; annars den första, markerad som den är.
  let email: string | null = null
  let emailVerified: boolean | null = null
  for (const candidate of found.emails) {
    const mx = await hasMx(candidate)
    if (email === null || (mx === true && emailVerified !== true)) {
      email = candidate
      emailVerified = mx
    }
    if (mx === true) break
  }
  if (!found.isTrainer) notes.push("Sidan nämner inte personlig träning tydligt – kontrollera att det är rätt person.")
  if (!found.emails.length) notes.push("Ingen e-postadress står öppet på sidan.")

  const suggestion: LeadInput = {
    name: found.name ?? new URL(page.url).hostname.replace(/^www\./, ""),
    title: found.title,
    segment: found.segment,
    email,
    emailVerified,
    phone: found.phones[0] ?? null,
    instagram: found.instagram,
    websiteUrl: found.websiteUrl,
    gym: found.gym,
    city: found.city,
    specialties: found.specialties,
    source: "url",
    sourceUrl: page.url,
  }
  const { score, breakdown } = scoreLead({
    name: suggestion.name!,
    title: suggestion.title ?? null,
    email,
    emailVerified,
    phone: suggestion.phone ?? null,
    instagram: suggestion.instagram ?? null,
    websiteUrl: suggestion.websiteUrl ?? null,
    gym: suggestion.gym ?? null,
    city: suggestion.city ?? null,
    specialties: suggestion.specialties ?? [],
    sourceUrl: page.url,
  })
  return { suggestion, found, score, breakdown, pages, notes }
}
