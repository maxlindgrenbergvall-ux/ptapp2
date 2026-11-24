"use client"

/**
 * Steg 1 (v76): konto och företag. Används både vid självregistreringen
 * (/bli-pt/konto, med e-post och lösenord) och för PT:er som Coavira skapat
 * (/pt/onboarding, bara namn, företag, portaler och avtal).
 */
import { MailCheck } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { PtFlowShell, ToggleChip } from "@/components/pt-onboarding/flow-shell"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useT } from "@/lib/i18n/provider"
import { accountErrors, type AccountDraft, signUpPt } from "@/lib/pt-onboarding-flow"
import { EMPTY_BUSINESS } from "@/lib/wellness/api"
import { cn } from "@/lib/utils"

export const emptyDraft = (): AccountDraft => ({
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  business: { ...EMPTY_BUSINESS },
  portals: { epassi: false, benifex: false, edenred: false },
  terms: false,
})

export function AccountFields({
  draft,
  onChange,
  signup,
  needsTerms,
  showErrors,
}: {
  draft: AccountDraft
  onChange: (d: AccountDraft) => void
  signup: boolean
  needsTerms: boolean
  showErrors: boolean
}) {
  const t = useT()
  const e = showErrors ? accountErrors(draft, { signup, needsTerms }) : {}
  const set = (patch: Partial<AccountDraft>) => onChange({ ...draft, ...patch })
  const setBiz = (patch: Partial<AccountDraft["business"]>) => onChange({ ...draft, business: { ...draft.business, ...patch } })
  const err = (show: boolean | undefined, text: string) => (show ? <p className="text-xs text-destructive">{text}</p> : null)

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="pt-first">{t("ptOnboarding.firstName")}</Label>
            <Input id="pt-first" autoComplete="given-name" value={draft.firstName} maxLength={60} onChange={(x) => set({ firstName: x.target.value })} aria-invalid={e.name || undefined} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pt-last">{t("ptOnboarding.lastName")}</Label>
            <Input id="pt-last" autoComplete="family-name" value={draft.lastName} maxLength={60} onChange={(x) => set({ lastName: x.target.value })} aria-invalid={e.name || undefined} />
          </div>
        </div>
        {err(e.name, t("ptOnboarding.nameRequired"))}
        {signup && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="pt-email">{t("ptOnboarding.email")}</Label>
              <Input id="pt-email" type="email" inputMode="email" autoComplete="email" value={draft.email} onChange={(x) => set({ email: x.target.value })} aria-invalid={e.email || undefined} />
              {err(e.email, t("ptOnboarding.emailInvalid"))}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pt-password">{t("ptOnboarding.password")}</Label>
              <Input
                id="pt-password"
                type="password"
                autoComplete="new-password"
                value={draft.password}
                onChange={(x) => set({ password: x.target.value })}
                placeholder={t("ptOnboarding.passwordHint")}
                aria-invalid={e.password || undefined}
              />
              {err(e.password, t("ptOnboarding.passwordShort"))}
            </div>
          </>
        )}
      </div>

      <fieldset className="space-y-3 rounded-2xl border p-3" data-testid="pt-company">
        <legend className="px-1 text-sm font-medium">{t("ptOnboarding.companyTitle")}</legend>
        <div className="space-y-1.5">
          <Label htmlFor="pt-company">{t("ptOnboarding.companyName")}</Label>
          <Input id="pt-company" autoComplete="organization" value={draft.business.companyName} maxLength={120} onChange={(x) => setBiz({ companyName: x.target.value })} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pt-org">{t("ptOnboarding.orgNumber")}</Label>
            <Input id="pt-org" inputMode="numeric" placeholder="NNNNNN-NNNN" maxLength={13} value={draft.business.orgNumber} onChange={(x) => setBiz({ orgNumber: x.target.value })} aria-invalid={e.org || undefined} />
            {err(e.org, t("ptOnboarding.orgInvalid"))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pt-address">{t("ptOnboarding.companyAddress")}</Label>
            <Input id="pt-address" autoComplete="street-address" value={draft.business.companyAddress} maxLength={200} onChange={(x) => setBiz({ companyAddress: x.target.value })} />
          </div>
        </div>
      </fieldset>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("ptOnboarding.portals")}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("ptOnboarding.portals")}>
          <ToggleChip on={draft.portals.epassi} onToggle={() => set({ portals: { ...draft.portals, epassi: !draft.portals.epassi } })} testId="pt-portal-epassi">
            ePassi
          </ToggleChip>
          <ToggleChip on={draft.portals.benifex} onToggle={() => set({ portals: { ...draft.portals, benifex: !draft.portals.benifex } })} testId="pt-portal-benifex">
            Benifex
          </ToggleChip>
          <ToggleChip on={draft.portals.edenred} onToggle={() => set({ portals: { ...draft.portals, edenred: !draft.portals.edenred } })} testId="pt-portal-edenred">
            Edenred
          </ToggleChip>
        </div>
      </div>

      {needsTerms && (
        <div className="space-y-1">
          <label className={cn("flex items-start gap-2.5 text-sm", e.terms && "text-destructive")}>
            <Checkbox checked={draft.terms} onCheckedChange={(v) => set({ terms: v === true })} className="mt-0.5" aria-invalid={e.terms || undefined} data-testid="pt-terms" />
            <span>
              {t("ptOnboarding.terms")}{" "}
              <Link href="/avtal/pt" target="_blank" className="font-medium text-foreground underline underline-offset-4">
                {t("ptOnboarding.readAgreement")}
              </Link>
            </span>
          </label>
          {err(e.terms, t("ptOnboarding.termsRequired"))}
        </div>
      )}
    </div>
  )
}

/** /bli-pt/konto: självregistreringen (steg 1 av 3). */
export function PtSignup() {
  const t = useT()
  const router = useRouter()
  const [draft, setDraft] = React.useState<AccountDraft>(emptyDraft)
  const [showErrors, setShowErrors] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [sentTo, setSentTo] = React.useState<string | null>(null)

  const submit = async () => {
    if (Object.keys(accountErrors(draft, { signup: true, needsTerms: true })).length) {
      setShowErrors(true)
      return
    }
    setBusy(true)
    const res = await signUpPt(draft, { id: "t1", name: `${draft.firstName} ${draft.lastName}` })
    if (res.error) {
      setBusy(false)
      return toast.error(t("ptOnboarding.signupFailed"), { description: res.error })
    }
    if (res.confirmEmail) {
      setBusy(false)
      setSentTo(draft.email.trim())
      return
    }
    // Hel sidladdning: proxy.ts läser den nya sessionen och öppnar steg 2.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/pt/onboarding")
  }

  if (sentTo) {
    return (
      <main className="mx-auto flex min-h-svh max-w-lg flex-col items-center justify-center gap-4 px-6 text-center" data-testid="pt-check-email">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-[#84cc16]/15 text-[#84cc16]">
          <MailCheck className="size-8" aria-hidden />
        </span>
        <h1 className="text-2xl font-bold tracking-tight">{t("ptOnboarding.checkEmailTitle")}</h1>
        <p className="text-muted-foreground">{t("ptOnboarding.checkEmailText", { email: sentTo })}</p>
      </main>
    )
  }

  return (
    <PtFlowShell
      step={1}
      onBack={() => router.push("/bli-pt")}
      title={t("ptOnboarding.s1Title")}
      lead={t("ptOnboarding.s1Lead")}
      primary={{ label: t("ptOnboarding.continue"), onClick: () => void submit(), busy }}
      testId="pt-signup"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
        noValidate
      >
        <AccountFields draft={draft} onChange={setDraft} signup needsTerms showErrors={showErrors} />
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden>
          {t("ptOnboarding.continue")}
        </button>
      </form>
    </PtFlowShell>
  )
}
