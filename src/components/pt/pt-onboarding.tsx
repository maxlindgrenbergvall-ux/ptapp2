"use client"

/**
 * /pt/onboarding (v76): PT-introt efter kontot, ett steg i taget.
 *   1. Namn, företag, portaler och avtal (bara om något saknas – t.ex. konton
 *      som Coavira skapat; självregistrerade PT:er har gjort det i /bli-pt/konto)
 *   2. Utbetalningar via Stripe Connect – "Hoppa över så länge" går bra
 *   3. Första paketet – eller "Skapa paket senare"
 * Steget sparas i databasen, så PT:n kommer tillbaka rätt (även från Stripe).
 * Det som hoppas över visas som en kort statusrad i dashboarden.
 */
import { Banknote, BadgeCheck, Clock, CreditCard, FileText, HeartPulse, Loader2, RefreshCw } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { AccountFields, emptyDraft } from "@/components/pt-onboarding/account-step"
import { PtFlowShell } from "@/components/pt-onboarding/flow-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberInput } from "@/components/ui/number-input"
import { useAppData } from "@/lib/data/store"
import { useT } from "@/lib/i18n/provider"
import { formatSek } from "@/lib/money"
import { openCheckout } from "@/lib/native/checkout"
import {
  accountErrors,
  type AccountDraft,
  demoConnectPayouts,
  fetchPtFlow,
  finishPtFlow,
  type PtFlowState,
  type PtStep,
  saveAccountStep,
  savePtStep,
} from "@/lib/pt-onboarding-flow"
import { isBusinessComplete } from "@/lib/wellness/api"
import { WELLNESS_PRICE_CHIPS, WELLNESS_TEMPLATE, wellnessCalc } from "@/lib/wellness/pricing"
import { cn } from "@/lib/utils"

const STRIPE_MESSAGE: Record<string, "stripeExpired" | "stripeIncomplete" | "stripeError"> = {
  forny: "stripeExpired",
  ofullstandig: "stripeIncomplete",
  fel: "stripeError",
}

export function PtOnboarding() {
  const t = useT()
  const { me, mode, actions, data } = useAppData()
  const [flow, setFlow] = React.useState<PtFlowState | null>(null)
  const [step, setStepState] = React.useState<PtStep>(1)
  const [draft, setDraft] = React.useState<AccountDraft>(emptyDraft)
  const [showErrors, setShowErrors] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    const params = new URLSearchParams(window.location.search)
    const message = STRIPE_MESSAGE[params.get("stripe") ?? ""]
    void fetchPtFlow(me).then((f) => {
      if (!alive) return
      if (f.completed) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/pt")
        return
      }
      setFlow(f)
      setDraft((d) => ({ ...d, firstName: f.firstName, lastName: f.lastName, business: f.business, portals: f.portals }))
      setStepState(message ? 2 : f.step)
      if (message) {
        if (message === "stripeError") toast.error(t(`ptOnboarding.${message}`))
        else toast(t(`ptOnboarding.${message}`))
        window.history.replaceState(null, "", window.location.pathname)
      }
    })
    return () => {
      alive = false
    }
    // Bara när sidan öppnas (t.ex. tillbaka från Stripe).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id])

  const goTo = (s: PtStep) => {
    setStepState(s)
    void savePtStep(s).catch(() => {})
  }

  const finish = async (): Promise<void> => {
    setBusy(true)
    const error = await finishPtFlow()
    if (error) {
      setBusy(false)
      toast.error(t("ptOnboarding.finishFailed"), { description: error })
      return
    }
    // Hel sidladdning: proxy.ts läser den nya JWT:n och portalen laddar sina data.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/pt?valkommen=1")
  }

  if (!flow) {
    return (
      <div className="flex min-h-svh items-center justify-center" aria-busy="true">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ------------------------------------------------------------- steg 1 ---
  if (step === 1) {
    const needsTerms = !flow.termsDone
    const save = async () => {
      if (Object.keys(accountErrors(draft, { signup: false, needsTerms })).length) {
        setShowErrors(true)
        return
      }
      setBusy(true)
      const error = await saveAccountStep(me, draft, needsTerms)
      setBusy(false)
      if (error) return toast.error(t("ptOnboarding.finishFailed"), { description: error })
      actions.updateTrainerProfile({ acceptsEpassi: draft.portals.epassi, acceptsBenifex: draft.portals.benifex, acceptsEdenred: draft.portals.edenred })
      setFlow({ ...flow, termsDone: true, business: draft.business, portals: draft.portals })
      goTo(2)
    }
    return (
      <PtFlowShell
        step={1}
        title={t("ptOnboarding.s1Title")}
        lead={t("ptOnboarding.s1LeadExisting")}
        primary={{ label: t("ptOnboarding.continue"), onClick: () => void save(), busy }}
        testId="pt-onboarding-account"
      >
        <AccountFields draft={draft} onChange={setDraft} signup={false} needsTerms={needsTerms} showErrors={showErrors} />
      </PtFlowShell>
    )
  }

  // ------------------------------------------------------------- steg 2 ---
  if (step === 2) {
    const connect = async () => {
      setBusy(true)
      if (mode === "demo") {
        await new Promise((r) => setTimeout(r, 400))
        demoConnectPayouts()
        setFlow({ ...flow, payoutsDone: true })
        setBusy(false)
        toast.success("Demoläge: utbetalningarna är kopplade (inget riktigt Stripe-konto).")
        return goTo(3)
      }
      try {
        const res = await fetch("/api/stripe/connect/onboard", { method: "POST" })
        const body = (await res.json().catch(() => ({}))) as { url?: string; done?: boolean; error?: string }
        if (body.done) {
          setFlow({ ...flow, payoutsDone: true })
          setBusy(false)
          return goTo(3)
        }
        if (!res.ok || !body.url) {
          setBusy(false)
          return toast.error(body.error ?? t("ptOnboarding.stripeError"))
        }
        // Webben: hela sidan går till Stripe (tillbaka till steg 3). Appen: webbläsarvyn.
        if ((await openCheckout(body.url)) === "closed") {
          setBusy(false)
          setFlow(await fetchPtFlow(me))
        }
      } catch {
        setBusy(false)
        toast.error(t("ptOnboarding.stripeError"))
      }
    }
    const done = flow.payoutsDone
    return (
      <PtFlowShell
        step={2}
        onBack={() => goTo(1)}
        title={t("ptOnboarding.s2Title")}
        lead={t("ptOnboarding.s2Lead")}
        primary={
          done
            ? { label: t("ptOnboarding.continue"), onClick: () => goTo(3) }
            : { label: flow.payoutsPending ? t("ptOnboarding.stripeContinue") : t("ptOnboarding.connect"), onClick: () => void connect(), busy, icon: <Banknote />, testId: "connect-payouts" }
        }
        secondary={done ? undefined : { label: t("ptOnboarding.skipForNow"), onClick: () => goTo(3), testId: "skip-payouts" }}
        testId="pt-onboarding-payouts"
      >
        <ul className="space-y-3">
          {(
            [
              [Banknote, "ptOnboarding.point1"],
              [CreditCard, "ptOnboarding.point2"],
              [FileText, "ptOnboarding.point3"],
            ] as const
          ).map(([Icon, key]) => (
            <li key={key} className="flex items-center gap-3 rounded-2xl border p-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#84cc16]/15 text-[#84cc16]">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="text-sm font-medium">{t(key)}</span>
            </li>
          ))}
        </ul>
        {done ? (
          <p className="flex items-center gap-2 rounded-xl border border-success/40 bg-success/10 px-3 py-2 text-sm font-medium" data-testid="payouts-done">
            <BadgeCheck className="size-4 text-success" /> {t("ptOnboarding.connected")}
          </p>
        ) : flow.payoutsPending ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-warning/50 bg-warning/10 px-3 py-2 text-sm">
            <span className="flex items-center gap-2">
              <Clock className="size-4" /> {t("ptOnboarding.stripeWaiting")}
            </span>
            {/* eslint-disable-next-line @next/next/no-location-assign-relative-destination -- route handler, inte en sida */}
            <Button variant="ghost" size="icon-sm" aria-label="Kontrollera igen" onClick={() => window.location.assign("/pt/onboarding/callback")}>
              <RefreshCw />
            </Button>
          </div>
        ) : null}
      </PtFlowShell>
    )
  }

  // ------------------------------------------------------------- steg 3 ---
  return <PackageStep flow={flow} busy={busy} setBusy={setBusy} onBack={() => goTo(2)} onFinish={finish} offersNutrition={data.trainers.find((x) => x.id === me.id)?.offersNutrition !== false} />
}

/** Steg 3: ett avskalat första paket. */
function PackageStep({
  flow,
  busy,
  setBusy,
  onBack,
  onFinish,
  offersNutrition,
}: {
  flow: PtFlowState
  busy: boolean
  setBusy: (b: boolean) => void
  onBack: () => void
  onFinish: () => Promise<void>
  offersNutrition: boolean
}) {
  const t = useT()
  const { actions } = useAppData()
  const [title, setTitle] = React.useState("")
  const [price, setPrice] = React.useState<number | undefined>(undefined)
  const [template, setTemplate] = React.useState(false)
  const calc = price && price > 0 ? wellnessCalc(price) : null
  const ready = title.trim().length >= 3 && Boolean(price && price >= 1)

  const useTemplate = () => {
    setTitle(WELLNESS_TEMPLATE.title)
    setPrice(WELLNESS_TEMPLATE.priceSek)
    setTemplate(true)
  }

  const save = async () => {
    if (!ready) return
    setBusy(true)
    const full = template && offersNutrition
    actions.saveService({
      id: actions.newId(),
      kind: full ? "full" : "package",
      title: title.trim().slice(0, 80),
      description: template ? (full ? WELLNESS_TEMPLATE.description : "Individanpassat träningsprogram samt full tillgång till Coavira+. Kan betalas med friskvårdsbidrag.") : "",
      sessions: template ? WELLNESS_TEMPLATE.sessions : 5,
      includesNutrition: full,
      durationWeeks: template ? WELLNESS_TEMPLATE.durationWeeks : undefined,
      priceSek: Math.round(price!),
      active: true,
      // Friskvårdspaketet kräver företagsuppgifterna (de står på kvittot).
      isWellnessPackage: template && isBusinessComplete(flow.business),
    })
    toast.success(t("ptOnboarding.packageSaved"))
    await onFinish()
  }

  return (
    <PtFlowShell
      step={3}
      onBack={onBack}
      title={t("ptOnboarding.s3Title")}
      lead={t("ptOnboarding.s3Lead")}
      primary={{ label: t("ptOnboarding.savePackage"), onClick: () => void save(), disabled: !ready, busy, testId: "save-first-package" }}
      secondary={{ label: t("ptOnboarding.later"), onClick: () => void onFinish(), testId: "package-later" }}
      testId="pt-onboarding-package"
    >
      <button
        type="button"
        onClick={useTemplate}
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl border border-dashed p-3 text-left transition-colors",
          template ? "border-[#84cc16] bg-[#84cc16]/10" : "hover:border-[#84cc16]/60"
        )}
        data-testid="first-wellness-template"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#84cc16]/15 text-[#84cc16]">
          <HeartPulse className="size-4" aria-hidden />
        </span>
        <span className="text-sm font-medium">+ {t("ptOnboarding.wellnessTemplate")}</span>
      </button>

      <div className="space-y-1.5">
        <Label htmlFor="first-title">{t("ptOnboarding.packageName")}</Label>
        <Input id="first-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="first-price">{t("ptOnboarding.price")}</Label>
        <NumberInput id="first-price" value={price} onValueChange={setPrice} />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("ptOnboarding.price")} data-testid="first-price-chips">
          {WELLNESS_PRICE_CHIPS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPrice(p)}
              aria-pressed={price === p}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium tabular transition-[background-color,border-color,color,scale] duration-150 active:scale-95",
                price === p ? "border-[#84cc16] bg-[#84cc16] text-[#131916]" : "hover:border-[#84cc16]/60"
              )}
            >
              {formatSek(p)}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t("ptOnboarding.chipsHint")}</p>
      </div>
      {calc && (
        <div className="space-y-1 rounded-xl bg-muted/50 px-3 py-2 text-sm" data-testid="first-calc" aria-live="polite">
          <p className="font-semibold">{t("ptOnboarding.youGet", { amount: formatSek(calc.ptNet) })}</p>
          <p className="text-xs text-muted-foreground">{t("ptOnboarding.clientPays", { amount: formatSek(calc.clientTotalApp) })}</p>
          {calc.capTip && (
            <p className="text-xs text-[#3f6212] dark:text-[#a3e635]" data-testid="first-calc-tip">
              {t("ptOnboarding.capTip", { price: formatSek(calc.capTip.price), cap: formatSek(calc.capTip.cap) })}
            </p>
          )}
        </div>
      )}
    </PtFlowShell>
  )
}
