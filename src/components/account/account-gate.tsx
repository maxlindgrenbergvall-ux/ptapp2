"use client"

/**
 * Kontoets status i appen (v65), monteras i klient- och PT-skalet:
 *
 *   1. Uppdaterat användaravtal: befintliga användare som godkände en äldre
 *      version (före communityreglerna) godkänner den nya innan de fortsätter.
 *      Dialogen går inte att stänga – reglerna ska vara godkända för att gälla.
 *   2. Avstängning: en tydlig banner med skälet, till när den gäller och hur man
 *      överklagar (beslutsmotivering). Databasen spärrar själva skrivningarna.
 *
 * Bara med Supabase; demoläget har inga avtal i databasen eller avstängningar.
 */
import { ExternalLink, ShieldAlert } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { acceptUpdatedAgreement, fetchAccountStatus, type AccountStatus } from "@/lib/account-status"
import { BRAND } from "@/lib/brand"
import { LEGAL_VERSION } from "@/lib/legal"
import { AGREEMENT_PARTS, LEGAL_DOCUMENTS } from "@/lib/onboarding"
import { fetchOnboardingStatus } from "@/lib/onboarding-client"
import { isSupabaseEnabled } from "@/lib/supabase/config"

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" })

export function AccountGate() {
  const [status, setStatus] = React.useState<AccountStatus | null>(null)
  const [role, setRole] = React.useState<"client" | "trainer" | null>(null)
  const [needsAgreement, setNeedsAgreement] = React.useState(false)

  React.useEffect(() => {
    if (!isSupabaseEnabled) return
    let cancelled = false
    void Promise.all([fetchAccountStatus().catch(() => null), fetchOnboardingStatus().catch(() => null)]).then(([s, o]) => {
      if (cancelled) return
      setStatus(s)
      // Bara efter intro-flödet – i introt godkänns avtalet i sitt eget steg.
      if ((o?.role === "client" || o?.role === "trainer") && o.completed) {
        setRole(o.role)
        setNeedsAgreement(!o.terms_done)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      {status?.suspended && <SuspensionBanner status={status} />}
      {role && needsAgreement && <AgreementUpdateDialog role={role} onDone={() => setNeedsAgreement(false)} />}
    </>
  )
}

function SuspensionBanner({ status }: { status: AccountStatus }) {
  return (
    <div role="alert" className="mb-4 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm" data-testid="suspension-banner">
      <p className="flex items-center gap-2 font-semibold text-destructive">
        <ShieldAlert className="size-5 shrink-0" aria-hidden />
        {status.suspended_until ? `Ditt konto är avstängt till ${fmtDate(status.suspended_until)}` : "Ditt konto är avstängt tills vidare"}
      </p>
      {status.suspension_reason && (
        <p className="mt-2">
          <span className="font-medium">Skäl:</span> {status.suspension_reason}
        </p>
      )}
      <p className="mt-2 text-muted-foreground">
        Du kan inte skicka meddelanden, ladda upp filer, boka eller köpa. Du kan fortfarande se och ladda ner din data.
        Tycker du att beslutet är fel? Överklaga inom sex månader till{" "}
        <a href={`mailto:${BRAND.contactEmail}?subject=${encodeURIComponent("Överklagande av avstängning")}`} className="font-medium text-foreground underline underline-offset-4">
          {BRAND.contactEmail}
        </a>
        .
      </p>
    </div>
  )
}

function AgreementUpdateDialog({ role, onDone }: { role: "client" | "trainer"; onDone: () => void }) {
  const [accepted, setAccepted] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const parts = AGREEMENT_PARTS[role]
  const save = async () => {
    if (!accepted || saving) return
    setSaving(true)
    try {
      await acceptUpdatedAgreement(role)
      toast.success("Tack! Det uppdaterade avtalet är godkänt.")
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Det gick inte att spara. Försök igen.")
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent showCloseButton={false} onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()} data-testid="agreement-update">
        <DialogHeader>
          <DialogTitle>Vi har uppdaterat användaravtalet</DialogTitle>
          <DialogDescription>
            Version {LEGAL_VERSION}. Nytt är <span className="font-medium text-foreground">communityreglerna</span>: vad som inte är
            tillåtet i appen, hur du rapporterar och hur konton kan varnas eller stängas av – med rätt att överklaga.
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-1.5 text-sm" aria-label="Avtalet består av">
          {parts.map((d) => (
            <li key={d}>
              <a href={LEGAL_DOCUMENTS[d].href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline">
                {LEGAL_DOCUMENTS[d].title} <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
        <label htmlFor="accept-updated-agreement" className="flex cursor-pointer gap-3 rounded-xl border p-3 text-sm">
          <Checkbox id="accept-updated-agreement" checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} className="mt-0.5" />
          <span>Jag har läst och godkänner Coaviras uppdaterade användaravtal, inklusive communityreglerna.</span>
        </label>
        <Button onClick={save} disabled={!accepted || saving} className="w-full" data-testid="accept-updated-agreement">
          {saving ? "Sparar …" : "Godkänn och fortsätt"}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
