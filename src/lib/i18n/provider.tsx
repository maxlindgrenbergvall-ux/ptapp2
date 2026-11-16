"use client"

/**
 * Språket i appen (v58): ett litet lager över React-kontext – ingen omladdning,
 * inga sidhopp när språket byts. Valet sparas i webbläsaren (localStorage +
 * cookie) och, för inloggade, i profilen (PreferenceSync i appens store).
 *
 * Servern renderar alltid svenska; i webbläsaren läses sparat val eller enhetens
 * språk direkt efter hydreringen (useSyncExternalStore).
 */
import * as React from "react"

import { DEFAULT_LOCALE, detectLocale, isLocale, LANG_COOKIE, LANG_STORAGE_KEY, LOCALE_TAG } from "@/lib/i18n/config"
import { type MessageKey, translate, type Vars } from "@/lib/i18n/translate"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import type { Locale } from "@/types/domain"

const listeners = new Set<() => void>()
let current: Locale | null = null

function readStored(): Locale | null {
  try {
    const v = localStorage.getItem(LANG_STORAGE_KEY)
    if (isLocale(v)) return v
  } catch {
    // Privat läge: inget sparat.
  }
  const m = typeof document !== "undefined" ? document.cookie.match(new RegExp(`(?:^|; )${LANG_COOKIE}=(\\w+)`)) : null
  return m && isLocale(m[1]) ? m[1] : null
}

function snapshot(): Locale {
  // Demoläget har svensk demodata: svenska tills man väljer annat. Riktiga konton följer enhetens språk.
  if (current === null) current = readStored() ?? (isSupabaseEnabled ? detectLocale(typeof navigator !== "undefined" ? navigator.languages : null) : DEFAULT_LOCALE)
  return current
}

/** Har användaren själv valt ett språk (annars är det enhetens)? */
export const hasStoredLocale = () => readStored() !== null

/** Byt språk överallt direkt. */
export function setAppLocale(locale: Locale) {
  current = locale
  try {
    localStorage.setItem(LANG_STORAGE_KEY, locale)
  } catch {
    // Privat läge – valet gäller tills fliken stängs.
  }
  document.cookie = `${LANG_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`
  document.documentElement.lang = locale
  for (const l of listeners) l()
}

const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useLocale(): Locale {
  return React.useSyncExternalStore(subscribe, snapshot, () => DEFAULT_LOCALE)
}

export function useT() {
  const locale = useLocale()
  return React.useMemo(() => {
    const t = (key: MessageKey | (string & {}), vars?: Vars) => translate(locale, key, vars)
    return Object.assign(t, { locale, tag: LOCALE_TAG[locale] })
  }, [locale])
}

/** Håller <html lang> i takt med språket. */
export function HtmlLang() {
  const locale = useLocale()
  React.useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])
  return null
}
