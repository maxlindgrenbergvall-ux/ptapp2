import Link from "next/link"

import { AuthCard } from "@/components/auth/auth-card"
import { PrivacyContent } from "@/components/legal/privacy-content"
import { PtAgreementContent } from "@/components/legal/pt-agreement-content"
import { TermsContent } from "@/components/legal/terms-content"

/**
 * Coaviras användaravtal (v34): ETT avtal som godkänns med en bock i intro-flödet.
 *   Del 1 Användarvillkor · Del 2 Integritetspolicy och hälsodata
 *   (PT:er, /avtal/pt) Del 3 PT-avtal och GDPR-åtagande.
 * Delarna finns också var för sig på /villkor, /integritet och /villkor/pt.
 * OBS: Utkast – ska granskas juridiskt innan lansering.
 */
export function AgreementDocument({ pt }: { pt: boolean }) {
  const parts = [
    { id: "villkor", title: "Del 1: Användarvillkor", content: <TermsContent /> },
    { id: "integritet", title: "Del 2: Integritetspolicy och hälsodata", content: <PrivacyContent /> },
    ...(pt ? [{ id: "pt", title: "Del 3: PT-avtal och GDPR-åtagande", content: <PtAgreementContent /> }] : []),
  ]
  return (
    <AuthCard title="Coaviras användaravtal" description={`Version 2026-11 · ${pt ? "för PT:er" : "för klienter"} · utkast inför lansering. Godkänns med en bock i intro-flödet.`}>
      <nav aria-label="Avtalets delar" className="rounded-xl bg-muted/60 p-3 text-sm">
        <ol className="space-y-1">
          {parts.map((p) => (
            <li key={p.id}>
              <a href={`#${p.id}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                {p.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      {parts.map((p) => (
        <section key={p.id} id={p.id} aria-labelledby={`${p.id}-title`} className="scroll-mt-24 space-y-3 border-t pt-4" data-testid={`agreement-part-${p.id}`}>
          <h2 id={`${p.id}-title`} className="text-base font-semibold">
            {p.title}
          </h2>
          <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">{p.content}</div>
        </section>
      ))}
      <p className="border-t pt-4 text-xs text-muted-foreground">
        Nyhetsbrev och erbjudanden ingår inte i avtalet – det väljer du separat och kan ändra under Inställningar.{" "}
        {pt ? (
          <Link href="/avtal" className="underline underline-offset-4">
            Visa klientversionen
          </Link>
        ) : (
          <Link href="/avtal/pt" className="underline underline-offset-4">
            Visa PT-versionen
          </Link>
        )}
      </p>
    </AuthCard>
  )
}
