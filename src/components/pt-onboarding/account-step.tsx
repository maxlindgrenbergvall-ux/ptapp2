"use client"

/**
 * Steg 1 (v76, uppdelat i v77): konto och företag på tre korta sidor –
 *   a. Ditt PT-konto (namn, och vid självregistrering e-post och lösenord)
 *   b. Ditt företag (står på friskvårdskvittona)
 *   c. Friskvård & avtal (portaler och PT-avtalet)
 * Används både vid självregistreringen (/bli-pt/konto) och för PT:er som
 * Coavira skapat (/pt/onboarding, utan e-post och lösenord).
 */
import { AnimatePresence, motion } from "framer-motion"
import { Check, MailCheck } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { PtFlowShell } from "@/components/pt-onboarding/flow-shell"
import { WellnessVerificationCard } from "@/components/wellness/verification-card"
import { EASE, Reveal } from "@/components/flow/motion"
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

export type AccountPart = 0 | 1 | 2
export const ACCOUNT_PARTS = 3

/** Felen som hör till en av de tre sidorna. */
const PART_FIELDS: Record<AccountPart, ("name" | "email" | "password" | "org" | "terms")[]> = {
  0: ["name", "email", "password"],
  1: ["org"],
  2: ["terms"],
}
export function partErrors(d: AccountDraft, part: AccountPart, opts: { signup: boolean; needsTerms: boolean }) {
  const all = accountErrors(d, opts)
  return PART_FIELDS[part].filter((k) => all[k])
}

const fieldClass = "h-12 rounded-xl bg-muted/40 px-4 text-base transition-[border-color,box-shadow] focus-visible:ring-[#84cc16]/40"

function Field({ id, label, error, children }: { id: string; label: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm text-muted-foreground">
        {label}
      </Label>
      {children}
      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="text-xs text-destructive"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

const PORTALS = [
  { key: "epassi", name: "ePassi" },
  { key: "benifex", name: "Benifex" },
  { key: "edenred", name: "Edenred" },
] as const

/** En av de tre sidorna i steg 1. */
export function AccountPage({
  part,
  draft,
  onChange,
  signup,
  needsTerms,
  showErrors,
}: {
  part: AccountPart
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

  if (part === 0) {
    return (
      <>
        <Reveal className="space-y-1.5">
          <div className="grid grid-cols-2 gap-3">
            <Field id="pt-first" label={t("ptOnboarding.firstName")}>
              <Input id="pt-first" className={fieldClass} autoComplete="given-name" value={draft.firstName} maxLength={60} onChange={(x) => set({ firstName: x.target.value })} aria-invalid={e.name || undefined} />
            </Field>
            <Field id="pt-last" label={t("ptOnboarding.lastName")}>
              <Input id="pt-last" className={fieldClass} autoComplete="family-name" value={draft.lastName} maxLength={60} onChange={(x) => set({ lastName: x.target.value })} aria-invalid={e.name || undefined} />
            </Field>
          </div>
          {e.name && <p className="text-xs text-destructive">{t("ptOnboarding.nameRequired")}</p>}
        </Reveal>
        {signup && (
          <>
            <Reveal>
              <Field id="pt-email" label={t("ptOnboarding.email")} error={e.email ? t("ptOnboarding.emailInvalid") : null}>
                <Input id="pt-email" className={fieldClass} type="email" inputMode="email" autoComplete="email" value={draft.email} onChange={(x) => set({ email: x.target.value })} aria-invalid={e.email || undefined} />
              </Field>
            </Reveal>
            <Reveal>
              <Field id="pt-password" label={t("ptOnboarding.password")} error={e.password ? t("ptOnboarding.passwordShort") : null}>
                <Input
                  id="pt-password"
                  className={fieldClass}
                  type="password"
                  autoComplete="new-password"
                  value={draft.password}
                  onChange={(x) => set({ password: x.target.value })}
                  placeholder={t("ptOnboarding.passwordHint")}
                  aria-invalid={e.password || undefined}
                />
              </Field>
            </Reveal>
          </>
        )}
      </>
    )
  }

  if (part === 1) {
    return (
      <div className="space-y-4" data-testid="pt-company">
        <Reveal>
          <Field id="pt-company" label={t("ptOnboarding.companyName")}>
            <Input id="pt-company" className={fieldClass} autoComplete="organization" value={draft.business.companyName} maxLength={120} onChange={(x) => setBiz({ companyName: x.target.value })} />
          </Field>
        </Reveal>
        <Reveal>
          <Field id="pt-org" label={t("ptOnboarding.orgNumber")} error={e.org ? t("ptOnboarding.orgInvalid") : null}>
            <Input
              id="pt-org"
              className={fieldClass}
              inputMode="numeric"
              placeholder="NNNNNN-NNNN"
              maxLength={13}
              value={draft.business.orgNumber}
              onChange={(x) => setBiz({ orgNumber: x.target.value })}
              aria-invalid={e.org || undefined}
            />
          </Field>
        </Reveal>
        <Reveal>
          <Field id="pt-address" label={t("ptOnboarding.companyAddress")}>
            <Input id="pt-address" className={fieldClass} autoComplete="street-address" value={draft.business.companyAddress} maxLength={200} onChange={(x) => setBiz({ companyAddress: x.target.value })} />
          </Field>
        </Reveal>
      </div>
    )
  }

  return (
    <>
      <Reveal className="space-y-2.5">
        <p className="text-sm text-muted-foreground">{t("ptOnboarding.portals")}</p>
        <div className="space-y-2" role="group" aria-label={t("ptOnboarding.portals")}>
          {PORTALS.map((p) => {
            const on = draft.portals[p.key]
            return (
              <button
                key={p.key}
                type="button"
                aria-pressed={on}
                onClick={() => set({ portals: { ...draft.portals, [p.key]: !on } })}
                data-testid={`pt-portal-${p.key}`}
                className={cn(
                  "flex h-14 w-full items-center justify-between rounded-2xl border px-4 text-left text-base font-medium transition-[background-color,border-color,scale] duration-200 active:scale-[0.99]",
                  on ? "border-[#84cc16]/70 bg-[#84cc16]/10" : "border-border/70 bg-muted/30 hover:border-[#84cc16]/50"
                )}
              >
                {p.name}
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full border transition-colors duration-200",
                    on ? "border-[#84cc16] bg-[#84cc16] text-[#131916]" : "border-muted-foreground/40"
                  )}
                  aria-hidden
                >
                  <AnimatePresence initial={false}>
                    {on && (
                      <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 500, damping: 24 }}>
                        <Check className="size-3.5" strokeWidth={3} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
              </button>
            )
          })}
        </div>
        {/* v81: portalavtalen verifieras (leverantörs-ID, bevis, intygande). Vid
            självregistreringen finns inget konto än – då görs det under Profil → Friskvård. */}
        {signup ? (
          (draft.portals.epassi || draft.portals.benifex || draft.portals.edenred) && (
            <p className="text-xs text-muted-foreground" data-testid="wellness-verify-later">
              Du verifierar avtalet med en skärmdump när kontot är skapat – sedan syns badgen.
            </p>
          )
        ) : (
          <WellnessVerificationCard portals={draft.portals} />
        )}
      </Reveal>
      {needsTerms && (
        <Reveal className="space-y-1.5">
          <label
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-2xl border bg-muted/30 p-4 text-sm leading-relaxed transition-colors",
              e.terms ? "border-destructive/60" : draft.terms ? "border-[#84cc16]/50" : "border-border/70"
            )}
          >
            <Checkbox checked={draft.terms} onCheckedChange={(v) => set({ terms: v === true })} className="mt-0.5" aria-invalid={e.terms || undefined} data-testid="pt-terms" />
            <span>
              {t("ptOnboarding.terms")}{" "}
              <Link href="/avtal/pt" target="_blank" className="font-medium text-foreground underline underline-offset-4">
                {t("ptOnboarding.readAgreement")}
              </Link>
            </span>
          </label>
          {e.terms && <p className="text-xs text-destructive">{t("ptOnboarding.termsRequired")}</p>}
        </Reveal>
      )}
    </>
  )
}

/** Titel och hjälpmening för sidorna i steg 1. */
export function accountCopy(part: AccountPart, signup: boolean) {
  if (part === 1) return { title: "ptOnboarding.s1CompanyTitle", lead: "ptOnboarding.s1CompanyLead" } as const
  if (part === 2) return { title: "ptOnboarding.s1PortalsTitle", lead: "ptOnboarding.s1PortalsLead" } as const
  return { title: "ptOnboarding.s1Title", lead: signup ? "ptOnboarding.s1Lead" : "ptOnboarding.s1LeadExisting" } as const
}

/**
 * Steg 1 som tre sidor i samma skal. `onDone` sparar allt när sista sidan är
 * klar och returnerar ett fel eller null.
 */
export function AccountStep({
  draft,
  onChange,
  signup,
  needsTerms,
  onExit,
  onDone,
  busy,
  testId,
  startPart = 0,
}: {
  draft: AccountDraft
  onChange: (d: AccountDraft) => void
  signup: boolean
  needsTerms: boolean
  /** Tillbaka från första sidan (t.ex. till karusellen). */
  onExit?: () => void
  onDone: () => void
  busy: boolean
  testId: string
  startPart?: AccountPart
}) {
  const t = useT()
  const [part, setPart] = React.useState<AccountPart>(startPart)
  const [showErrors, setShowErrors] = React.useState(false)
  const copy = accountCopy(part, signup)

  const next = () => {
    if (partErrors(draft, part, { signup, needsTerms }).length) {
      setShowErrors(true)
      return
    }
    setShowErrors(false)
    if (part < 2) setPart((part + 1) as AccountPart)
    else onDone()
  }
  const back = part > 0 ? () => (setShowErrors(false), setPart((part - 1) as AccountPart)) : onExit

  return (
    <PtFlowShell
      step={1}
      page={10 + part}
      progress={(part + 1) / ACCOUNT_PARTS}
      onBack={back}
      title={t(copy.title)}
      lead={t(copy.lead)}
      primary={{ label: t("ptOnboarding.continue"), onClick: next, busy }}
      testId={testId}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          next()
        }}
        noValidate
        className="space-y-5"
        data-part={part}
      >
        <AccountPage part={part} draft={draft} onChange={onChange} signup={signup} needsTerms={needsTerms} showErrors={showErrors} />
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden>
          {t("ptOnboarding.continue")}
        </button>
      </form>
    </PtFlowShell>
  )
}

/** /bli-pt/konto: självregistreringen (steg 1 av 3). */
export function PtSignup() {
  const t = useT()
  const router = useRouter()
  const [draft, setDraft] = React.useState<AccountDraft>(emptyDraft)
  const [busy, setBusy] = React.useState(false)
  const [sentTo, setSentTo] = React.useState<string | null>(null)

  const submit = async () => {
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
        <motion.span
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          className="flex size-16 items-center justify-center rounded-2xl bg-[#84cc16]/15 text-[#84cc16]"
        >
          <MailCheck className="size-8" aria-hidden />
        </motion.span>
        <h1 className="text-2xl font-bold tracking-tight">{t("ptOnboarding.checkEmailTitle")}</h1>
        <p className="text-muted-foreground">{t("ptOnboarding.checkEmailText", { email: sentTo })}</p>
      </main>
    )
  }

  return (
    <AccountStep
      draft={draft}
      onChange={setDraft}
      signup
      needsTerms
      onExit={() => router.push("/bli-pt")}
      onDone={() => void submit()}
      busy={busy}
      testId="pt-signup"
    />
  )
}
