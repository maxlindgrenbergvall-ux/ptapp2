"use client"

import { ExternalLink, FileCheck2, Mail, ShieldCheck } from "lucide-react"
import * as React from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { AGREEMENT_PARTS, AGREEMENT_TITLE, LEGAL_DOCUMENTS } from "@/lib/onboarding"
import { cn } from "@/lib/utils"

/**
 * Intro-flödets avtalssteg (v34) – samma för klienter och PT:er:
 *
 *   1. ETT obligatoriskt godkännande av Coaviras användaravtal. Avtalet består av
 *      användarvillkor + integritetspolicy (PT:er även PT-avtal och GDPR-åtagande);
 *      delarna listas kort och hela avtalet öppnas på /avtal.
 *   2. Ett valfritt samtycke till nyhetsbrev, erbjudanden och produktnyheter –
 *      aldrig förkryssat, påverkar inte kontot och kan ändras i Inställningar.
 *
 * Komponenten är "kontrollerad": föräldern håller värdena och skickar dem till
 * accept_user_agreement() när användaren går vidare.
 */
export function AgreementFields({
  role,
  accepted,
  onAcceptedChange,
  marketing,
  onMarketingChange,
  invalid,
  version,
}: {
  role: "client" | "trainer"
  accepted: boolean
  onAcceptedChange: (v: boolean) => void
  marketing: boolean
  onMarketingChange: (v: boolean) => void
  /** Användaren försökte gå vidare utan att godkänna. */
  invalid?: boolean
  version?: string
}) {
  const parts = AGREEMENT_PARTS[role]
  const href = role === "trainer" ? "/avtal/pt" : "/avtal"
  return (
    <div className="space-y-4" data-testid="agreement-step">
      <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-card">
        <p className="flex items-center gap-2 font-semibold">
          <FileCheck2 className="size-5 text-primary" /> {AGREEMENT_TITLE}
          {version && <span className="text-xs font-normal text-muted-foreground">version {version}</span>}
        </p>
        <p className="text-sm text-muted-foreground">Ett avtal som samlar allt du behöver godkänna för att använda Coavira:</p>
        <ul className="space-y-2" aria-label="Avtalet består av">
          {parts.map((d) => (
            <li key={d} className="flex gap-2.5 text-sm">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="font-medium">{LEGAL_DOCUMENTS[d].title}.</span> <span className="text-muted-foreground">{LEGAL_DOCUMENTS[d].summary}</span>
              </span>
            </li>
          ))}
        </ul>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
          data-testid="read-agreement"
        >
          Läs hela avtalet <ExternalLink className="size-3.5" />
        </a>
      </div>

      {/* 1. Obligatoriskt – ett enda godkännande. */}
      <label
        htmlFor="accept-agreement"
        className={cn(
          "flex cursor-pointer gap-3 rounded-2xl border-2 p-4 transition-colors",
          accepted ? "border-primary bg-primary/5" : invalid ? "border-destructive bg-destructive/5" : "border-border"
        )}
      >
        <Checkbox
          id="accept-agreement"
          checked={accepted}
          onCheckedChange={(v) => onAcceptedChange(v === true)}
          aria-required
          aria-invalid={invalid && !accepted ? true : undefined}
          aria-describedby={invalid && !accepted ? "accept-agreement-error" : undefined}
          className="mt-0.5 size-5"
          data-testid="accept-agreement"
        />
        <span className="space-y-1 text-sm leading-snug">
          <span className="block font-medium">
            Jag godkänner Coaviras användaravtal
            {role === "trainer" ? " – användarvillkoren, integritetspolicyn, PT-avtalet och GDPR-åtagandet" : " – användarvillkoren och integritetspolicyn"}.
          </span>
          <span className="block text-xs text-muted-foreground">Obligatoriskt. Ditt godkännande sparas med datum och avtalsversion.</span>
          {invalid && !accepted && (
            <span id="accept-agreement-error" role="alert" className="block text-xs font-medium text-destructive">
              Godkänn avtalet för att gå vidare.
            </span>
          )}
        </span>
      </label>

      {/* 2. Valfritt – nyhetsbrev, erbjudanden och produktnyheter. */}
      <label htmlFor="marketing-consent" className="flex cursor-pointer gap-3 rounded-2xl border p-4">
        <Checkbox
          id="marketing-consent"
          checked={marketing}
          onCheckedChange={(v) => onMarketingChange(v === true)}
          className="mt-0.5 size-5"
          data-testid="marketing-consent"
        />
        <span className="space-y-1 text-sm leading-snug">
          <span className="flex items-center gap-1.5 font-medium">
            <Mail className="size-4 text-muted-foreground" aria-hidden /> Ja tack, skicka nyhetsbrev, erbjudanden och produktnyheter
          </span>
          <span className="block text-xs text-muted-foreground">Valfritt. Via e-post och notiser. Du kan avsluta när som helst under Inställningar.</span>
        </span>
      </label>
    </div>
  )
}
