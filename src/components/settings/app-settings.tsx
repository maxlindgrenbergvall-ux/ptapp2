"use client"

/**
 * Appinställningar (v58): språk och träningsintressen.
 *
 *   Profil → Inställningar → Appinställningar  (/klient/installningar/app, /pt/installningar/app)
 *
 * Samma språkväljare och intresse-pills används i första steget av intro-flödet.
 * Allt är optimistiskt: ett tryck byter språket i hela appen direkt (ingen
 * omladdning, inget sidhopp) och sparas i profilen i bakgrunden.
 */
import { Check, ChevronLeft } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { useAppData } from "@/lib/data/store"
import { LOCALE_FLAG, LOCALE_NAME, LOCALES } from "@/lib/i18n/config"
import { hasStoredLocale, setAppLocale, useLocale, useT } from "@/lib/i18n/provider"
import { translate } from "@/lib/i18n/translate"
import { INTEREST_EMOJI, TRAINING_INTERESTS } from "@/lib/training-modes"
import { cn } from "@/lib/utils"
import type { Locale, TrainingInterest } from "@/types/domain"

/** Byt språk: direkt i gränssnittet, sedan i profilen. */
export function useChangeLanguage() {
  const { actions } = useAppData()
  return React.useCallback(
    (locale: Locale, opts: { toast?: boolean } = {}) => {
      setAppLocale(locale)
      actions.setPreferences({ language: locale })
      if (opts.toast) toast.success(translate(locale, "lang.changed"), { id: "lang" })
    },
    [actions]
  )
}

/** Språkväljaren: fem rader med fast höjd – listan rör sig inte när man väljer. */
export function LanguagePicker({ onPick }: { onPick: (locale: Locale) => void }) {
  const locale = useLocale()
  const t = useT()
  return (
    <div role="radiogroup" aria-label={t("lang.choose")} className="grid gap-1.5" data-testid="language-picker">
      {LOCALES.map((l) => {
        const on = l === locale
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={on}
            lang={l}
            data-locale={l}
            onClick={() => onPick(l)}
            className={cn(
              "flex h-12 items-center gap-3 rounded-2xl border px-4 text-left text-[15px] transition-[background-color,border-color] duration-200 active:scale-[0.99]",
              on ? "border-primary bg-primary/10 font-semibold" : "border-border/70 bg-card hover:bg-muted/50"
            )}
          >
            <span aria-hidden className="text-lg leading-none">
              {LOCALE_FLAG[l]}
            </span>
            <span className="flex-1">{LOCALE_NAME[l]}</span>
            <span className={cn("flex size-5 items-center justify-center rounded-full transition-opacity duration-200", on ? "bg-primary text-primary-foreground opacity-100" : "opacity-0")}>
              <Check className="size-3.5" strokeWidth={3} />
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Kompakt språkrad (registrering och intro-flödets första steg): fem chips med fast storlek. */
export function LanguageChips({ onPick, className }: { onPick: (locale: Locale) => void; className?: string }) {
  const locale = useLocale()
  const t = useT()
  return (
    <div role="radiogroup" aria-label={t("lang.choose")} className={cn("grid grid-cols-5 gap-1 rounded-2xl bg-muted p-1", className)} data-testid="language-chips">
      {LOCALES.map((l) => {
        const on = l === locale
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={LOCALE_NAME[l]}
            lang={l}
            data-locale={l}
            onClick={() => onPick(l)}
            className={cn(
              "flex h-10 items-center justify-center gap-1 rounded-xl text-xs font-semibold uppercase transition-[background-color,color,box-shadow] duration-200",
              on ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span aria-hidden className="text-base leading-none normal-case">
              {LOCALE_FLAG[l]}
            </span>
            {l}
          </button>
        )
      })}
    </div>
  )
}

/** Träningsintressen som 1-klicks-pills (flera val). */
export function InterestPills({ value, onChange }: { value: TrainingInterest[]; onChange: (next: TrainingInterest[]) => void }) {
  const t = useT()
  const set = new Set(value)
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t("interests.title")} data-testid="interest-pills">
      {TRAINING_INTERESTS.map((i) => {
        const on = set.has(i)
        return (
          <button
            key={i}
            type="button"
            aria-pressed={on}
            data-interest={i}
            onClick={() => onChange(on ? value.filter((x) => x !== i) : [...value, i])}
            className={cn(
              "inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-[background-color,border-color,color] duration-200 active:scale-95",
              on ? "border-primary bg-primary text-primary-foreground" : "border-border/70 bg-card text-foreground hover:border-primary/50"
            )}
          >
            <span aria-hidden>{INTEREST_EMOJI[i]}</span>
            {t(`interests.${i}`)}
            {/* Platsen för bocken finns alltid – pillen ändrar inte bredd när den väljs. */}
            <Check className={cn("size-3.5 transition-opacity duration-200", on ? "opacity-100" : "opacity-0")} strokeWidth={3} aria-hidden />
          </button>
        )
      })}
    </div>
  )
}

/**
 * Profilens språk vinner när den laddas (inloggning på en ny enhet). Har
 * profilen inget språk än sparas det som valts här (t.ex. vid registreringen).
 */
export function PreferenceSync() {
  const { data, actions, mode } = useAppData()
  const locale = useLocale()
  const saved = data.preferences?.language
  const pushed = React.useRef(false)
  React.useEffect(() => {
    if (saved && saved !== locale) setAppLocale(saved)
  }, [saved]) // eslint-disable-line react-hooks/exhaustive-deps -- bara när profilen ändras, inte när användaren byter
  React.useEffect(() => {
    if (saved || pushed.current || mode === "demo" || !hasStoredLocale()) return
    pushed.current = true
    actions.setPreferences({ language: locale })
  }, [saved, mode, locale, actions])
  return null
}

export function AppSettings({ base }: { base: "/klient" | "/pt" }) {
  const { data, actions } = useAppData()
  const t = useT()
  const change = useChangeLanguage()
  const interests = data.preferences?.trainingInterests ?? []
  return (
    <div className="mx-auto max-w-2xl space-y-6" data-testid="app-settings">
      <div className="space-y-1">
        <Link href={`${base}/installningar`} className="-ml-1 inline-flex min-h-9 items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> {t("settings.title")}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{t("settings.app")}</h1>
        <p className="text-sm text-muted-foreground">{t("settings.appLead")}</p>
      </div>

      <section className="space-y-2" aria-labelledby="lang-title">
        <h2 id="lang-title" className="text-sm font-semibold">
          {t("lang.title")}
        </h2>
        <LanguagePicker onPick={(l) => change(l, { toast: true })} />
        <p className="px-1 text-xs text-muted-foreground">{t("settings.languageHint")}</p>
      </section>

      <section className="space-y-2" aria-labelledby="interests-title">
        <h2 id="interests-title" className="text-sm font-semibold">
          {t("interests.title")}
        </h2>
        <InterestPills
          value={interests}
          onChange={(next) => {
            actions.setPreferences({ trainingInterests: next })
          }}
        />
        {/* Fast höjd: raden finns alltid, så inget hoppar när det sista valet tas bort. */}
        <p className="min-h-5 px-1 text-xs text-muted-foreground">{interests.length ? t("settings.interestsHint") : t("interests.none")}</p>
      </section>
    </div>
  )
}
