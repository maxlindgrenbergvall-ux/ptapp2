import { normalizePhone } from "@/lib/phone"
import { CITIES, GYM_CHAINS, SEGMENTS, type LeadInput, type Segment } from "@/lib/crm/types"

/**
 * CSV-import (v47). Tolkar en fil med rubrikrad – komma, semikolon eller tabb
 * (Excel i Sverige sparar med semikolon). Kolumnerna känns igen på namnet, på
 * svenska eller engelska, i valfri ordning. Okända kolumner hoppas över.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "")
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ""
  const count = (c: string) => firstLine.split(c).length - 1
  const delimiter = count(";") > count(",") ? ";" : count("\t") > count(",") ? "\t" : ","
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === "") quoted = true
    else if (ch === delimiter) {
      row.push(cell)
      cell = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++
      row.push(cell)
      cell = ""
      if (row.some((c) => c.trim())) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim())) rows.push(row)
  return rows
}

type Field = "name" | "firstName" | "lastName" | "title" | "email" | "phone" | "instagram" | "websiteUrl" | "gym" | "city" | "segment" | "specialties"
const HEADERS: [Field, RegExp][] = [
  ["firstName", /^(f[öo]rnamn|first\s*name|given\s*name)$/i],
  ["lastName", /^(efternamn|last\s*name|surname|family\s*name)$/i],
  ["name", /^(namn|name|full\s*name|fullst[äa]ndigt\s*namn|kontakt(person)?)$/i],
  ["title", /^(titel|title|roll|role|befattning)$/i],
  ["email", /^(e-?post(adress)?|e-?mail(\s*address)?|mejl|mail)$/i],
  ["phone", /^(telefon(nummer)?|tel|mobil(nummer)?|phone(\s*number)?|mobile)$/i],
  ["instagram", /^(instagram|insta|ig)(\s*-?\s*(handle|konto|profil|url))?$/i],
  ["websiteUrl", /^(webb(plats|sida)?|hemsida|website|url|site|l[äa]nk)$/i],
  ["gym", /^(gym|gymkedja|f[öo]retag|company|arbetsgivare|organisation)$/i],
  ["city", /^(stad|ort|city|region|kommun)$/i],
  ["segment", /^(segment|kategori|category|typ|type)$/i],
  ["specialties", /^(specialisering(ar)?|inriktning(ar)?|specialt(y|ies)|nisch)$/i],
]

export function normalizeInstagram(raw: string): string | null {
  const m = /instagram\.com\/([A-Za-z0-9._]{1,30})/i.exec(raw)
  const handle = (m ? m[1] : raw).trim().replace(/^@/, "").replace(/\/+$/, "")
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? handle : null
}

export function normalizeUrl(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`)
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return null
    u.hash = ""
    return u.href.replace(/\/$/, "").slice(0, 500)
  } catch {
    return null
  }
}

function segmentFrom(raw: string, gym: string | null): Segment | undefined {
  const t = raw.trim().toLowerCase()
  if ((SEGMENTS as readonly string[]).includes(t)) return t as Segment
  if (/influenc|online/.test(t)) return "influencer"
  if (/gym|kedja|sats|nordic/.test(t)) return "gym_chain"
  if (/frilans|freelanc|egen/.test(t)) return "freelance"
  return gym && GYM_CHAINS.some((g) => g.pattern.test(gym)) ? "gym_chain" : undefined
}

export interface CsvResult {
  leads: LeadInput[]
  /** Rader som hoppades över, med radnummer i filen och skäl. */
  skipped: { line: number; reason: string }[]
  /** Kolumner i filen som kändes igen. */
  columns: string[]
}

export const MAX_CSV_ROWS = 2000

export function leadsFromCsv(text: string): CsvResult {
  const rows = parseCsv(text)
  if (rows.length < 2) return { leads: [], skipped: [], columns: [] }
  const map = rows[0].map((h) => HEADERS.find(([, re]) => re.test(h.trim()))?.[0] ?? null)
  const columns = rows[0].filter((_, i) => map[i]).map((h) => h.trim())
  const leads: LeadInput[] = []
  const skipped: CsvResult["skipped"] = []
  for (let r = 1; r < rows.length && r <= MAX_CSV_ROWS; r++) {
    const get = (f: Field) => {
      const i = map.indexOf(f)
      return i >= 0 ? (rows[r][i] ?? "").trim() : ""
    }
    const name = get("name") || [get("firstName"), get("lastName")].filter(Boolean).join(" ")
    const emailRaw = get("email").toLowerCase()
    const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailRaw) ? emailRaw : null
    const instagram = get("instagram") ? normalizeInstagram(get("instagram")) : null
    const websiteUrl = get("websiteUrl") ? normalizeUrl(get("websiteUrl")) : null
    if (!name && !email && !instagram) {
      skipped.push({ line: r + 1, reason: "Saknar namn, e-post och Instagram" })
      continue
    }
    if (emailRaw && !email) {
      skipped.push({ line: r + 1, reason: `Ogiltig e-postadress: ${emailRaw.slice(0, 60)}` })
      continue
    }
    const gym = get("gym") || null
    const cityRaw = get("city")
    const phoneRaw = get("phone")
    leads.push({
      name: (name || instagram || email!.split("@")[0]).slice(0, 160),
      title: get("title").slice(0, 160) || null,
      email,
      phone: phoneRaw ? normalizePhone(phoneRaw.replace(/^(\+46)\s*0/, "$1")) : null,
      instagram,
      websiteUrl,
      gym: gym?.slice(0, 120) ?? null,
      city: (CITIES.find((c) => c.toLowerCase() === cityRaw.toLowerCase()) ?? cityRaw.slice(0, 80)) || null,
      segment: segmentFrom(get("segment"), gym),
      specialties: get("specialties")
        .split(/[,;|/]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 12),
      source: "csv",
    })
  }
  if (rows.length - 1 > MAX_CSV_ROWS) skipped.push({ line: MAX_CSV_ROWS + 2, reason: `Filen har fler än ${MAX_CSV_ROWS} rader – resten hoppades över` })
  return { leads, skipped, columns }
}
