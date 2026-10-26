"use client"

/**
 * Inbjudningsvyn ("Bjud in & tjäna") för klienter och PT:er.
 *
 *   Klient: bjud in en vän → vännen får 1 månad Coavira Plus och du +30 dagar.
 *   PT:     bjud in en PT → när hen verifierats (certifiering@coavira.com) får du
 *           en veckas PT Boost.
 *
 * Belöningarna delas ut av databasen (redeem_referral och verifieringen) – vyn
 * visar bara koden, länken, statistiken och ett fält för att lösa in en kod.
 * Inga namn på inbjudna visas.
 */
import { Check, CheckCircle2, Copy, Gift, Hourglass, Loader2, Mail, Rocket, Share2, Sparkles, Ticket } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { PlusBadge, usePlus } from "@/components/plus/require-plus"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { BRAND } from "@/lib/brand"
import { useAppData } from "@/lib/data/store"
import { StorePlusOffer } from "@/components/plus/store-purchase"
import { usePurchaseMode } from "@/lib/native/use-digital-purchases"
import {
  isPlusActive,
  normalizeReferralCode,
  plusDaysLeft,
  REFERRAL_BOOST_DAYS,
  REFERRAL_PLUS_DAYS,
  REFERRAL_WINDOW_DAYS,
  referralLink,
} from "@/lib/plus"
import { cn } from "@/lib/utils"
import { isNativeApp } from "@/lib/native/app"
import type { Referral } from "@/types/domain"

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" })

export function ReferralDashboard() {
  const { data, me } = useAppData()
  const { account } = usePlus()
  const trainer = me.role === "trainer"
  const sent = data.referrals.filter((r) => r.referrerId === me.id)
  const completed = sent.filter((r) => r.status === "COMPLETED")
  const rewarded = completed.filter((r) => r.referrerRewarded)
  const received = data.referrals.find((r) => r.referredId === me.id)

  return (
    <div className="space-y-5" data-testid="referral-dashboard">
      <InviteCard code={account?.referralCode} trainer={trainer} />

      <div className="grid grid-cols-3 gap-2" data-testid="referral-stats">
        <Stat label="Inbjudna" value={sent.length} />
        <Stat label="Klara" value={completed.length} />
        <Stat label={trainer ? "Boostveckor" : "Plusmånader"} value={rewarded.length} highlight />
      </div>

      {trainer ? <BoostRewardInfo /> : <PlusStatusCard />}

      {account?.canRedeem && !received && <RedeemCard />}
      {received && (
        <p className="flex items-center gap-2 rounded-xl border bg-muted/40 px-4 py-3 text-sm" data-testid="referral-received">
          <Ticket className="size-4 text-primary" aria-hidden />
          {received.status === "COMPLETED"
            ? `Du gick med via en inbjudan ${formatDate(received.createdAt)}.`
            : "Din inbjudningskod är sparad – belöningen delas ut när du verifierats."}
        </p>
      )}

      <ReferralList referrals={sent} trainer={trainer} />
    </div>
  )
}

/** Koden, länken och knapparna för att kopiera och dela. */
function InviteCard({ code, trainer }: { code?: string; trainer: boolean }) {
  const [copied, setCopied] = React.useState<"code" | "link" | null>(null)
  const link = code ? referralLink(code) : ""
  const shareText = trainer
    ? `Jag använder ${BRAND.name} för mina klienter. Ansök som PT med min kod:`
    : `Träna med mig på ${BRAND.name}! Med min länk får du 1 månad Coavira Plus gratis:`

  const copy = async (what: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(what === "code" ? code! : link)
      setCopied(what)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      toast.error("Kunde inte kopiera – markera och kopiera för hand.")
    }
  }
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share(trainer ? { title: BRAND.name, text: `${shareText} ${code}` } : { title: BRAND.name, text: shareText, url: link })
      } catch {
        // Avbrutet av användaren.
      }
      return
    }
    void copy(trainer ? "code" : "link")
  }

  return (
    <Card className="relative gap-4 overflow-hidden border-brand/40" data-testid="invite-card">
      <div aria-hidden className="pointer-events-none absolute -top-20 -right-16 size-56 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brand)_30%,transparent),transparent)]" />
      <CardHeader className="relative">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Gift className="size-5 text-primary" aria-hidden />
          {trainer ? "Bjud in en PT – få en veckas Boost" : "Ge 1 månad, få 1 månad"}
        </CardTitle>
        <CardDescription className="text-pretty">
          {trainer
            ? `När PT:n du bjudit in verifierats av ${BRAND.name} får du ${REFERRAL_BOOST_DAYS} dagar PT Boost gratis.`
            : `Din vän får ${REFERRAL_PLUS_DAYS} dagar Coavira Plus när hen skapar konto med din länk – och du får ${REFERRAL_PLUS_DAYS} dagar till.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="relative space-y-3">
        {code ? (
          <>
            <div className="flex items-center gap-2">
              <span className="flex-1 rounded-xl border-2 border-dashed border-brand/50 bg-background/70 px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.3em]" data-testid="referral-code">
                {code}
              </span>
              <Button variant="outline" size="icon" className="size-12" onClick={() => void copy("code")} aria-label="Kopiera koden">
                {copied === "code" ? <Check /> : <Copy />}
              </Button>
            </div>
            {/* PT:er ansöker via e-post (inget eget konto), så de får koden – inte länken. */}
            {!trainer && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate" data-testid="referral-link">
                  {link}
                </span>
                <Button variant="ghost" size="sm" onClick={() => void copy("link")}>
                  {copied === "link" ? <Check /> : <Copy />} {copied === "link" ? "Kopierad" : "Kopiera länk"}
                </Button>
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button onClick={() => void share()}>
                <Share2 /> Dela inbjudan
              </Button>
              {trainer ? (
                <Button variant="outline" asChild>
                  <a
                    href={`mailto:?subject=${encodeURIComponent(`Bli PT på ${BRAND.name}`)}&body=${encodeURIComponent(
                      `${shareText} ${code}\n\nSkicka ditt certifikat till ${BRAND.certificationEmail} och ange koden ${code}.`
                    )}`}
                  >
                    <Mail /> Bjud in via e-post
                  </a>
                </Button>
              ) : (
                <Button variant="outline" asChild>
                  <a href={`sms:?&body=${encodeURIComponent(`${shareText} ${link}`)}`}>
                    <Mail /> Skicka som sms
                  </a>
                </Button>
              )}
            </div>
          </>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Hämtar din kod …
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={cn("rounded-xl border bg-card px-3 py-3 text-center", highlight && "border-brand/50 bg-brand/5")}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

/** Klient: nuvarande Plus-status och länk till Plus-sidan. */
function PlusStatusCard() {
  const { account, isPlus } = usePlus()
  const days = plusDaysLeft(account)
  return (
    <Card className="gap-2" data-testid="plus-status">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" aria-hidden /> Coavira Plus
          {isPlus && <PlusBadge className="ml-auto" />}
        </CardTitle>
        <CardDescription>
          {!isPlus
            ? "Du har gratisversionen. Bjud in en vän så får ni båda en månad Plus."
            : days === Infinity
              ? "Du har Coavira Plus utan slutdatum."
              : `Aktivt till ${formatDate(account!.plusUntil!)} · ${days} ${days === 1 ? "dag" : "dagar"} kvar`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="link" className="h-auto p-0" asChild>
          <Link href="/klient/plus">Vad ingår i Coavira Plus?</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

/** PT: hur belöningen fungerar (verifieringen sker manuellt). */
function BoostRewardInfo() {
  return (
    <Card className="gap-2" data-testid="boost-reward-info">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Rocket className="size-4 text-primary" aria-hidden /> Så får du din Boost
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Dela din kod med en PT som vill börja på {BRAND.name}.</li>
          <li>
            PT:n anger koden när hen ansöker via{" "}
            <a className="text-primary underline-offset-2 hover:underline" href={`mailto:${BRAND.certificationEmail}`}>
              {BRAND.certificationEmail}
            </a>
            .
          </li>
          <li>När certifikatet godkänts förlängs din PT Boost automatiskt med {REFERRAL_BOOST_DAYS} dagar.</li>
        </ol>
      </CardContent>
    </Card>
  )
}

/** Nya konton (inom 14 dagar) kan lösa in en väns kod i efterhand. */
function RedeemCard() {
  const { actions } = useAppData()
  const [code, setCode] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPending(true)
    const res = await actions.redeemReferral(code)
    setPending(false)
    if (res.error) toast.error(res.error)
    else toast.success(res.message ?? "Koden är inlöst")
  }
  return (
    <Card className="gap-3" data-testid="redeem-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Ticket className="size-4 text-primary" aria-hidden /> Har du fått en kod?
        </CardTitle>
        <CardDescription>Nya konton kan lösa in en väns kod inom {REFERRAL_WINDOW_DAYS} dagar.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void submit(e)} className="flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(normalizeReferralCode(e.target.value).slice(0, 8))}
            placeholder="T.ex. SARA7KQ2"
            aria-label="Inbjudningskod"
            autoCapitalize="characters"
            autoComplete="off"
            className="font-mono tracking-widest uppercase"
          />
          <Button type="submit" disabled={pending || code.length !== 8}>
            {pending && <Loader2 className="animate-spin" />} Lös in
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

/** Mina inbjudningar – utan namn (den inbjudnas identitet visas inte). */
function ReferralList({ referrals, trainer }: { referrals: Referral[]; trainer: boolean }) {
  if (referrals.length === 0)
    return <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Inga inbjudningar än. Dela din kod för att komma igång!</p>
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground">Dina inbjudningar</h2>
      <ul className="divide-y overflow-hidden rounded-xl border bg-card" data-testid="referral-list">
        {referrals.map((r, i) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            {r.status === "COMPLETED" ? <CheckCircle2 className="size-4 text-emerald-600" aria-hidden /> : <Hourglass className="size-4 text-amber-600" aria-hidden />}
            <span className="min-w-0 flex-1">
              <span className="block font-medium">
                {trainer ? "PT" : "Vän"} #{referrals.length - i}
              </span>
              <span className="block text-xs text-muted-foreground">{formatDate(r.createdAt)}</span>
            </span>
            {r.status === "PENDING" ? (
              <Badge variant="outline">Väntar på verifiering</Badge>
            ) : r.referrerRewarded ? (
              <Badge className="border-transparent bg-emerald-600/15 text-emerald-700 dark:text-emerald-400">
                +{trainer ? `${REFERRAL_BOOST_DAYS} dagar Boost` : `${REFERRAL_PLUS_DAYS} dagar Plus`}
              </Badge>
            ) : (
              <Badge variant="outline" title="Max 12 belöningar per år">
                Klar · taket nått
              </Badge>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Plus-sidan: status, vad som ingår och köp. Hanterar återkomsten från Stripe. */
export function PlusPage() {
  const { mode, actions } = useAppData()
  const { account, isPlus } = usePlus()
  const [pending, setPending] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)
  // Webben: Stripe. iPhone-appen: App Store-prenumeration. Android-appen: inte än.
  const purchase = usePurchaseMode()

  // Tillbaka från Stripe: /klient/plus?plus=klar&session_id=cs_… eller ?plus=avbrutet.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const result = params.get("plus")
    if (!result) return
    const sessionId = params.get("session_id")
    window.history.replaceState(null, "", window.location.pathname)
    if (result === "avbrutet") {
      toast("Köpet avbröts – inget har dragits.")
      return
    }
    if (result !== "klar" || !sessionId) return
    let cancelled = false
    const run = async () => {
      setConfirming(true)
      for (let i = 0; i < 8 && !cancelled; i++) {
        const status = await actions.confirmPlus(sessionId)
        if (status === "paid") {
          toast.success("Välkommen till Coavira Plus!")
          break
        }
        if (status === "expired" || status === "unknown") {
          toast.error("Betalningen gick inte igenom. Försök igen.")
          break
        }
        await new Promise((r) => setTimeout(r, 1500))
      }
      if (!cancelled) setConfirming(false)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [actions])

  const buy = async () => {
    setPending(true)
    const error = await actions.buyPlus()
    if (error) {
      setPending(false)
      toast.error(error)
      return
    }
    if (mode === "demo") {
      setPending(false)
      toast.success(isPlus ? "Plus är förlängt med 30 dagar" : "Coavira Plus är aktiverat", { description: "Demoläge: betalningen simuleras." })
    }
    // Appen: betalningen sker i webbläsarvyn – när den stängs (Klar eller efter betalningen) slutar knappen snurra.
    if (mode !== "demo" && isNativeApp()) setPending(false)
  }

  const days = plusDaysLeft(account)
  const features: [string, string][] = [
    ["Sömntracking", "Logga sömn och se hur den påverkar träningen."],
    ["Full historik", "Alla pass och all kost – inte bara de senaste 30 dagarna."],
    ["Djupgående grafer", "1RM-utveckling och volym över tid per övning."],
    ["Export till CSV", "Ladda ner träning och kost till Excel eller Numbers."],
  ]
  const free = ["Dagens kostschema", "Boka pass", "Utföra dina pass", "Chatt med din PT"]

  return (
    <div className="space-y-5">
      <Card className={cn("relative gap-3 overflow-hidden", isPlusActive(account) && "border-brand/60 bg-brand/5")} data-testid="plus-page-status">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="size-5 text-primary" aria-hidden /> {isPlus ? "Du har Coavira Plus" : "Gratisversionen"}
            {isPlus && <PlusBadge className="ml-auto" />}
          </CardTitle>
          <CardDescription>
            {confirming
              ? "Bekräftar betalningen …"
              : !isPlus
                ? "Lås upp full historik, sömntracking och djupgående grafer med Coavira Plus."
                : days === Infinity
                  ? "Plus utan slutdatum."
                  : `Aktivt till ${formatDate(account!.plusUntil!)} · ${days} ${days === 1 ? "dag" : "dagar"} kvar`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <Button asChild size="lg">
            <Link href="/klient/inbjudningar">
              <Gift /> Bjud in en vän &amp; få 1 månad gratis
            </Link>
          </Button>
          {purchase === "store" && (
            <div className="sm:col-span-2">
              <StorePlusOffer isPlus={isPlus} renews={Boolean(account?.storePlusRenews)} />
            </div>
          )}
          {purchase === "stripe" && (
            <Button size="lg" variant="outline" onClick={() => void buy()} disabled={pending || confirming}>
              {pending || confirming ? <Loader2 className="animate-spin" /> : <Sparkles />} {isPlus ? "Förläng Coavira Plus" : "Skaffa Coavira Plus"}
            </Button>
          )}
        </CardContent>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-brand/40 bg-card p-4">
          <h2 className="mb-2 flex items-center gap-2 font-semibold">
            <Sparkles className="size-4 text-primary" aria-hidden /> Ingår i Plus
          </h2>
          <ul className="space-y-2 text-sm">
            {features.map(([title, text]) => (
              <li key={title}>
                <span className="block font-medium">{title}</span>
                <span className="block text-muted-foreground">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 font-semibold">Alltid gratis</h2>
          <ul className="space-y-2 text-sm">
            {free.map((f) => (
              <li key={f} className="flex items-center gap-2">
                <Check className="size-4 text-emerald-600" aria-hidden /> {f}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            {purchase === "store" ? "Plus via App Store förnyas automatiskt tills du säger upp det." : "Plus förnyas inte automatiskt."} Exporten av all din data (GDPR) är alltid gratis.
          </p>
        </div>
      </section>
    </div>
  )
}
