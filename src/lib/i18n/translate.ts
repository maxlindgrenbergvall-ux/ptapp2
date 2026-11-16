/**
 * Översättning (v58) – ren funktion, enhetstestad.
 *   t("fields.roundsN", { n: 4 }) → "4 varv" / "4 rounds" / "4 rondas" …
 * Saknas en nyckel (ska inte hända – typerna kräver alla) visas den svenska texten.
 */
import de from "@/lib/i18n/dictionaries/de"
import en from "@/lib/i18n/dictionaries/en"
import es from "@/lib/i18n/dictionaries/es"
import fr from "@/lib/i18n/dictionaries/fr"
import sv, { type Dictionary } from "@/lib/i18n/dictionaries/sv"
import type { Locale } from "@/types/domain"

export const DICTIONARIES: Record<Locale, Dictionary> = { sv, en, es, fr, de }

/** "a.b.c" för varje sträng i ordboken. */
type Paths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`>
}[keyof T & string]
export type MessageKey = Paths<Dictionary>
export type Vars = Record<string, string | number>

function lookup(dict: Dictionary, key: string): string | undefined {
  let cur: unknown = dict
  for (const part of key.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[part]
    else return undefined
  }
  return typeof cur === "string" ? cur : undefined
}

export function translate(locale: Locale, key: MessageKey | (string & {}), vars?: Vars): string {
  const text = lookup(DICTIONARIES[locale], key) ?? lookup(sv, key) ?? key
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text
}

/** Finns nyckeln (t.ex. en Hyrox-hjälptext för en viss övning)? */
export const hasMessage = (key: string) => lookup(sv, key) !== undefined
