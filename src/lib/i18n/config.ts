/**
 * Språk i appen (v58) – rena funktioner, enhetstestade i e2e/i18n.unit.ts.
 *
 * Språket väljs i första steget (förvalt efter enhetens språk), sparas i
 * profiles.preferred_language och i webbläsaren (localStorage + cookie, så att
 * registreringssidan också kan visas på rätt språk före inloggning).
 */
import type { Locale } from "@/types/domain"

export const LOCALES: Locale[] = ["sv", "en", "es", "fr", "de"]
export const DEFAULT_LOCALE: Locale = "sv"

/** Språkets namn på språket självt – så hittar man sitt eget även om fel språk är valt. */
export const LOCALE_NAME: Record<Locale, string> = { sv: "Svenska", en: "English", es: "Español", fr: "Français", de: "Deutsch" }
export const LOCALE_FLAG: Record<Locale, string> = { sv: "🇸🇪", en: "🇬🇧", es: "🇪🇸", fr: "🇫🇷", de: "🇩🇪" }
/** För Intl (datum, tal). */
export const LOCALE_TAG: Record<Locale, string> = { sv: "sv-SE", en: "en-GB", es: "es-ES", fr: "fr-FR", de: "de-DE" }

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as string[]).includes(v)

/**
 * Förval efter enhetens språklista (navigator.languages): första språket vi har.
 * "de-AT" → de, "en-US" → en, "nb-NO" → sv (nordiskt – närmast), annars engelska.
 * Saknas listan helt (server, test) blir det svenska.
 */
export function detectLocale(languages: readonly string[] | undefined | null): Locale {
  if (!languages || languages.length === 0) return DEFAULT_LOCALE
  for (const tag of languages) {
    const base = tag.toLowerCase().split(/[-_]/)[0]
    if (isLocale(base)) return base
    if (base === "nb" || base === "nn" || base === "no" || base === "da") return "sv"
  }
  return "en"
}

export const LANG_STORAGE_KEY = "coavira:lang"
export const LANG_COOKIE = "coavira-lang"
