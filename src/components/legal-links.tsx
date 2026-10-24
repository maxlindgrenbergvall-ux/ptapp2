"use client"

import { ExternalLink, FileText, LifeBuoy, ShieldCheck } from "lucide-react"
import Link from "next/link"

import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  CONSENT_TEXT_MIDDLE,
  CONSENT_TEXT_PRIVACY,
  CONSENT_TEXT_START,
  CONSENT_TEXT_TERMS,
  PRIVACY_URL,
  SUPPORT_URL,
  TERMS_URL,
} from "@/lib/legal"
import { cn } from "@/lib/utils"

/** Integritetspolicy, användarvillkor och support (Inställningar). */
export function LegalLinksCard() {
  const links = [
    { href: PRIVACY_URL, label: "Integritetspolicy", icon: ShieldCheck },
    { href: TERMS_URL, label: "Användarvillkor", icon: FileText },
    { href: SUPPORT_URL, label: "Support och kontakt", icon: LifeBuoy },
  ]
  return (
    <Card className="gap-2" data-testid="legal-links">
      <CardHeader>
        <CardTitle className="text-base">Villkor och integritet</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <ul className="divide-y border-y">
          {links.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-6 py-3 text-sm transition-colors hover:bg-muted/60">
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                <span className="flex-1">{label}</span>
                <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden />
                <span className="sr-only">(öppnas i ny flik)</span>
              </a>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

/**
 * Den obligatoriska bockrutan vid registreringen: användarvillkoren och
 * behandlingen av hälsouppgifter (GDPR art. 9.2 a – uttryckligt samtycke).
 */
export function ConsentCheckbox({
  id,
  checked,
  onCheckedChange,
  className,
  invalid,
}: {
  id: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  className?: string
  invalid?: boolean
}) {
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border p-3", invalid && "border-destructive", className)}>
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} className="mt-0.5" aria-required="true" aria-invalid={invalid || undefined} />
      <label htmlFor={id} className="text-sm leading-snug">
        {CONSENT_TEXT_START}
        <Link href={TERMS_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
          {CONSENT_TEXT_TERMS}
        </Link>
        {CONSENT_TEXT_MIDDLE}
        <Link href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
          {CONSENT_TEXT_PRIVACY}
        </Link>
        .
      </label>
    </div>
  )
}
