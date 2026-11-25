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
import { motion } from "framer-motion"
import { ArrowDownLeft, Banknote, BadgeCheck, Check, Clock, CreditCard, FileText, HeartPulse, Landmark, Loader2, RefreshCw } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { AccountStep, emptyDraft } from "@/components/pt-onboarding/account-step"
import { PtFlowShell } from "@/components/pt-onboarding/flow-shell"
import { CountUp, EASE, Reveal } from "@/components/flow/motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberInput } from "@/components/ui/number-input"
import { useAppData } from "@/lib/data/store"
import { useT } from "@/lib/i18n/provider"
import { formatSek } from "@/lib/money"
import { openCheckout } from "@/lib/native/checkout"
import {
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

  // Tillbaka från steg 2 öppnar sista sidan i steg 1 (avtalet), inte den första.
  const [backToPart, setBackToPart] = React.useState<0 | 2>(0)
  const goTo = (s: PtStep) => {
    if (s === 1) setBackToPart(2)
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
      setBusy(true)
      const error = await saveAccountStep(me, draft, needsTerms)
      setBusy(false)
      if (error) return toast.error(t("ptOnboarding.finishFailed"), { description: error })
      actions.updateTrainerProfile({ acceptsEpassi: draft.portals.epassi, acceptsBenifex: draft.portals.benifex, acceptsEdenred: draft.portals.edenred })
      setFlow({ ...flow, termsDone: true, business: draft.business, portals: draft.portals })
      goTo(2)
    }
    return (
      <AccountStep
        draft={draft}
        onChange={setDraft}
        signup={false}
        needsTerms={needsTerms}
        onDone={() => void save()}
        busy={busy}
        testId="pt-onboarding-account"
        startPart={backToPart}
      />
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
        <Reveal>
          <PayoutVisual done={done} />
        </Reveal>
        <ul className="space-y-3.5">
          {(
            [
              [Banknote, "ptOnboarding.point1"],
              [CreditCard, "ptOnboarding.point2"],
              [FileText, "ptOnboarding.point3"],
            ] as const
          ).map(([Icon, key]) => (
            <Reveal as="li" key={key} className="flex items-center gap-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#84cc16]/12 text-[#84cc16]">
                <Icon className="size-[1.1rem]" aria-hidden />
              </span>
              <span className="text-[0.95rem] font-medium">{t(key)}</span>
            </Reveal>
          ))}
        </ul>
        {done ? (
          <p className="flex items-center gap-2 rounded-2xl border border-success/40 bg-success/10 px-4 py-3 text-sm font-medium" data-testid="payouts-done">
            <BadgeCheck className="size-4 text-success" /> {t("ptOnboarding.connected")}
          </p>
        ) : flow.payoutsPending ? (
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-warning/50 bg-warning/10 px-4 py-2 text-sm">
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
      <Reveal>
        <button
          type="button"
          onClick={useTemplate}
          aria-pressed={template}
          className={cn(
            "group relative w-full overflow-hidden rounded-3xl border p-4 text-left transition-[border-color,background-color] duration-300",
            template ? "border-[#84cc16]/70 bg-[#84cc16]/10" : "border-border/70 bg-muted/30 hover:border-[#84cc16]/50"
          )}
          data-testid="first-wellness-template"
        >
          <span aria-hidden className="pointer-events-none absolute -top-16 -right-10 size-40 rounded-full bg-[#84cc16]/15 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />
          <span className="relative flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#84cc16]/15 text-[#84cc16]">
              <HeartPulse className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{t("ptOnboarding.wellnessTemplate")}</span>
              <span className="mt-0.5 block text-sm text-muted-foreground">
                {t("ptOnboarding.templateMeta", { weeks: WELLNESS_TEMPLATE.durationWeeks, sessions: WELLNESS_TEMPLATE.sessions, price: formatSek(WELLNESS_TEMPLATE.priceSek) })}
              </span>
            </span>
            <span
              className={cn(
                "mt-1 flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-200",
                template ? "border-[#84cc16] bg-[#84cc16] text-[#131916]" : "border-muted-foreground/40"
              )}
              aria-hidden
            >
              {template && (
                <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 500, damping: 24 }}>
                  <Check className="size-3.5" strokeWidth={3} />
                </motion.span>
              )}
            </span>
          </span>
        </button>
      </Reveal>

      <Reveal className="space-y-1.5">
        <Label htmlFor="first-title" className="text-sm text-muted-foreground">
          {t("ptOnboarding.packageName")}
        </Label>
        <Input id="first-title" className="h-12 rounded-xl bg-muted/40 px-4 text-base" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
      </Reveal>
      <Reveal className="space-y-2.5">
        <Label htmlFor="first-price" className="text-sm text-muted-foreground">
          {t("ptOnboarding.price")}
        </Label>
        <NumberInput id="first-price" className="h-12 rounded-xl bg-muted/40 px-4 text-base" value={price} onValueChange={setPrice} />
        <div className="grid grid-cols-4 gap-1.5" role="group" aria-label={t("ptOnboarding.price")} data-testid="first-price-chips">
          {WELLNESS_PRICE_CHIPS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPrice(p)}
              aria-pressed={price === p}
              className={cn(
                "h-9 rounded-full border text-xs font-medium tabular transition-[background-color,border-color,color,scale] duration-200 active:scale-95",
                price === p ? "border-[#84cc16] bg-[#84cc16] text-[#131916]" : "border-border/70 hover:border-[#84cc16]/60"
              )}
            >
              {formatSek(p)}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{t("ptOnboarding.chipsHint")}</p>
      </Reveal>
      <motion.div
        initial={false}
        animate={{ opacity: calc ? 1 : 0, height: calc ? "auto" : 0 }}
        transition={{ duration: 0.35, ease: EASE }}
        className="overflow-hidden"
      >
        {calc && (
          <div className="space-y-1 rounded-2xl bg-gradient-to-br from-[#84cc16]/14 to-[#84cc16]/4 px-4 py-3.5" data-testid="first-calc" aria-live="polite">
            <p className="text-lg font-semibold">
              {t("ptOnboarding.youGetPrefix")} <CountUp value={calc.ptNet} format={formatSek} /> {t("ptOnboarding.youGetSuffix")}
            </p>
            <p className="text-sm text-muted-foreground">{t("ptOnboarding.clientPays", { amount: formatSek(calc.clientTotalApp) })}</p>
            {calc.capTip && (
              <p className="pt-1 text-xs text-[#3f6212] dark:text-[#a3e635]" data-testid="first-calc-tip">
                {t("ptOnboarding.capTip", { price: formatSek(calc.capTip.price), cap: formatSek(calc.capTip.cap) })}
              </p>
            )}
          </div>
        )}
      </motion.div>
    </PtFlowShell>
  )
}

/**
 * Steg 2: en liten bild av en utbetalning – beloppet räknar upp och landar på
 * bankkontot. När Stripe är kopplat visas en bock i stället för pilen.
 */
function PayoutVisual({ done }: { done: boolean }) {
  const t = useT()
  return (
    <div className="relative overflow-hidden rounded-3xl border border-[#84cc16]/25 bg-gradient-to-br from-[#84cc16]/16 via-[#84cc16]/6 to-transparent p-5" aria-hidden>
      <motion.span
        className="pointer-events-none absolute -top-20 -left-10 size-48 rounded-full bg-[#84cc16]/20 blur-3xl"
        animate={{ x: [0, 40, 0], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="relative flex items-center justify-between">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("ptOnboarding.illoPayout")}</span>
        <span className="flex items-center gap-1.5 rounded-full bg-background/60 px-2.5 py-1 text-xs font-medium">
          <Landmark className="size-3.5 text-[#84cc16]" /> {t("ptOnboarding.illoBank")}
        </span>
      </div>
      <div className="relative mt-4 flex items-end justify-between">
        <p className="text-3xl font-bold tracking-tight">
          +<CountUpOnMount value={3495} />
        </p>
        <motion.span
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.5, type: "spring", stiffness: 300, damping: 18 }}
          className="flex size-10 items-center justify-center rounded-full bg-[#84cc16] text-[#131916]"
        >
          {done ? <Check className="size-5" strokeWidth={3} /> : <ArrowDownLeft className="size-5" strokeWidth={2.5} />}
        </motion.span>
      </div>
    </div>
  )
}

function CountUpOnMount({ value }: { value: number }) {
  const [target, setTarget] = React.useState(0)
  React.useEffect(() => {
    const id = setTimeout(() => setTarget(value), 250)
    return () => clearTimeout(id)
  }, [value])
  return <CountUp value={target} format={formatSek} />
}
