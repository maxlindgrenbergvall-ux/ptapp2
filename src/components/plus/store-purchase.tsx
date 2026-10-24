"use client"

/**
 * Köp i iPhone-appen via App Store: Coavira Plus (prenumeration, månad/år)
 * och PT Boost (engångsköp, 7 dagar). Visar det Apple kräver vid
 * prenumerationer: pris från App Store, längd, att den förnyas automatiskt
 * och hur man säger upp, länkar till villkor och integritetspolicy, samt
 * "Återställ köp" och "Hantera prenumeration".
 */
import { Loader2, RotateCcw, Rocket, Settings2, Sparkles } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useAppData } from "@/lib/data/store"
import { PRIVACY_URL, TERMS_URL } from "@/lib/legal"
import {
  buyOption,
  loadBoostOption,
  loadPlusOptions,
  openManageSubscriptions,
  PurchaseCancelled,
  restoreStorePurchases,
  type StoreOption,
} from "@/lib/native/purchases"
import { BOOST_PRODUCT, FALLBACK_PRICE, PLUS_MONTHLY, PLUS_YEARLY } from "@/lib/payments/store-products"
import { cn } from "@/lib/utils"

/** Reservalternativ medan App Store svarar (priserna byts mot butikens). */
const FALLBACK_PLUS: StoreOption[] = [
  { id: PLUS_MONTHLY, kind: "monthly", priceString: FALLBACK_PRICE[PLUS_MONTHLY], title: "Coavira Plus" },
  { id: PLUS_YEARLY, kind: "yearly", priceString: FALLBACK_PRICE[PLUS_YEARLY], title: "Coavira Plus" },
]
const PERIOD = { monthly: "månad", yearly: "år", boost: "7 dagar" } as const
/** Så länge väntar vi på App Store innan vi säger att produkterna inte går att hämta. */
const LOAD_TIMEOUT_MS = 15_000

type LoadState = "loading" | "ready" | "unavailable"

/** Hämta från App Store med tidsgräns (ett plugin som aldrig svarar ska inte låsa vyn). */
function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), LOAD_TIMEOUT_MS))])
}

/** Visas när App Store inte lämnar ut produkterna (t.ex. "Missing Metadata" eller inget aktivt avtal). */
function Unavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <p className="rounded-lg bg-muted px-3 py-2 text-center text-sm text-muted-foreground" role="status" data-testid="store-unavailable">
      Köpet kan inte göras just nu – App Store svarar inte med priserna.{" "}
      <button type="button" className="underline underline-offset-4" onClick={onRetry}>
        Försök igen
      </button>
    </p>
  )
}

function useStoreAction() {
  const { me, actions } = useAppData()
  const [pending, setPending] = React.useState<string | null>(null)
  const run = async (key: string, task: () => Promise<void>, success: string) => {
    setPending(key)
    try {
      await task()
      const error = await actions.syncStorePurchases()
      if (error) toast.error(error)
      else toast.success(success)
    } catch (e) {
      if (!(e instanceof PurchaseCancelled)) toast.error("Köpet gick inte igenom", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setPending(null)
    }
  }
  const restore = () => run("restore", () => restoreStorePurchases(me.id), "Dina köp är återställda")
  return { me, pending, run, restore }
}

export function StorePlusOffer({ isPlus, renews }: { isPlus: boolean; renews: boolean }) {
  const { me, pending, run, restore } = useStoreAction()
  const [options, setOptions] = React.useState<StoreOption[]>(FALLBACK_PLUS)
  const [state, setState] = React.useState<LoadState>("loading")
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    withTimeout(loadPlusOptions(me.id))
      .then((o) => {
        if (cancelled) return
        if (o.length) setOptions(o)
        setState(o.length ? "ready" : "unavailable")
      })
      .catch(() => !cancelled && setState("unavailable"))
    return () => {
      cancelled = true
    }
  }, [me.id, attempt])
  const retry = () => (setState("loading"), setAttempt((n) => n + 1))

  return (
    <div className="space-y-3" data-testid="store-plus-offer">
      {renews ? (
        <Button variant="outline" size="lg" className="w-full" onClick={() => void openManageSubscriptions(me.id)}>
          <Settings2 /> Hantera prenumeration
        </Button>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((o) => (
            <Button
              key={o.id}
              size="lg"
              variant={o.kind === "yearly" ? "default" : "outline"}
              className="h-auto min-h-14 flex-col gap-0 py-2"
              disabled={pending !== null || !o.pkg}
              onClick={() => void run(o.id, () => buyOption(me.id, o), "Välkommen till Coavira Plus!")}
              data-testid={`store-plus-${o.kind}`}
            >
              <span className="flex items-center gap-2 font-semibold">
                {pending === o.id || state === "loading" ? <Loader2 className="animate-spin" /> : <Sparkles />} {o.priceString} / {PERIOD[o.kind]}
              </span>
              <span className="text-xs font-normal opacity-80">{o.kind === "yearly" ? "Plus i ett år – lägsta priset" : "Plus varje månad"}</span>
            </Button>
          ))}
        </div>
      )}
      {!renews && state === "unavailable" && <Unavailable onRetry={retry} />}
      <StoreFooter onRestore={restore} restoring={pending === "restore"}>
        {isPlus && renews
          ? "Din prenumeration förnyas automatiskt. Säg upp den senast 24 timmar före periodens slut under Hantera prenumeration."
          : "Prenumerationen förnyas automatiskt varje månad eller år till samma pris tills du säger upp den, senast 24 timmar före periodens slut, i App Store-inställningarna. Betalningen dras från ditt Apple-konto."}
      </StoreFooter>
    </div>
  )
}

export function StoreBoostOffer({ active, disabled }: { active: boolean; disabled?: boolean }) {
  const { me, pending, run, restore } = useStoreAction()
  const [option, setOption] = React.useState<StoreOption>({ id: BOOST_PRODUCT, kind: "boost", priceString: FALLBACK_PRICE[BOOST_PRODUCT], title: "PT Boost" })
  const [state, setState] = React.useState<LoadState>("loading")
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    withTimeout(loadBoostOption(me.id))
      .then((o) => {
        if (cancelled) return
        if (o) setOption(o)
        setState(o ? "ready" : "unavailable")
      })
      .catch(() => !cancelled && setState("unavailable"))
    return () => {
      cancelled = true
    }
  }, [me.id, attempt])
  const retry = () => (setState("loading"), setAttempt((n) => n + 1))

  return (
    <div className="space-y-3" data-testid="store-boost-offer">
      <Button
        className="w-full"
        disabled={disabled || pending !== null || !option.product}
        onClick={() => void run("boost", () => buyOption(me.id, option), "Din profil är boostad!")}
      >
        {pending === "boost" || state === "loading" ? <Loader2 className="animate-spin" /> : <Rocket />} {active ? "Förläng" : "Boosta i"} 7 dagar ·{" "}
        {option.priceString}
      </Button>
      {state === "unavailable" && <Unavailable onRetry={retry} />}
      <StoreFooter onRestore={restore} restoring={pending === "restore"}>
        Engångsköp via App Store – förnyas inte automatiskt. En förlängning läggs efter din pågående boost.
      </StoreFooter>
    </div>
  )
}

function StoreFooter({ children, onRestore, restoring }: { children: React.ReactNode; onRestore: () => void; restoring: boolean }) {
  return (
    <div className="space-y-2 text-center text-xs text-muted-foreground">
      <p className="text-pretty">{children}</p>
      <p>
        <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
          Användarvillkor (EULA)
        </a>{" "}
        ·{" "}
        <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
          Integritetspolicy
        </a>
      </p>
      <button type="button" onClick={onRestore} disabled={restoring} className={cn("inline-flex items-center gap-1 underline underline-offset-4", restoring && "opacity-60")}>
        {restoring ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />} Återställ köp
      </button>
    </div>
  )
}
