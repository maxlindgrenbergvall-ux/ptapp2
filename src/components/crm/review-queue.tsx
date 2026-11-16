"use client"

import { ArrowLeft, AtSign, Ban, Building2, CheckCheck, ExternalLink, Globe, Megaphone, Search, SkipForward, Sparkles, UserRound, type LucideIcon } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { EmptyState } from "@/components/common"
import { ApiError, CompanyTypeBadge, crm, ScoreBadge, SegmentBadge } from "@/components/crm/parts"
import { Button } from "@/components/ui/button"
import { COMPANY_TYPE_LABEL, SOURCE_LABEL, type CompanyType } from "@/lib/crm/enrichment/decide"
import type { Lead } from "@/lib/crm/types"
import { cn } from "@/lib/utils"

/** Leads som ska granskas: bolagstypen är inte bekräftad för hand, och leaden är fortfarande aktuell. */
export const needsReview = (l: Lead) => !l.companyTypeManual && l.status !== "not_relevant" && l.status !== "customer" && !l.unsubscribedAt

type Choice = { key: string; label: string; icon: LucideIcon; type?: CompanyType; reject?: true; hint: string }
const CHOICES: Choice[] = [
  { key: "a", label: COMPANY_TYPE_LABEL.ab, icon: Building2, type: "ab", hint: "Aktiebolag – B2B-mejl tillåtet" },
  { key: "e", label: COMPANY_TYPE_LABEL.enskild_firma, icon: UserRound, type: "enskild_firma", hint: "Bara referensgrupp eller DM" },
  { key: "g", label: COMPANY_TYPE_LABEL.gym_anstalld, icon: Building2, type: "gym_anstalld", hint: "PT på gymkedja" },
  { key: "i", label: COMPANY_TYPE_LABEL.influencer, icon: Megaphone, type: "influencer", hint: "Onlinecoach utan bekräftat AB" },
  { key: "p", label: COMPANY_TYPE_LABEL.privatperson, icon: UserRound, type: "privatperson", hint: "Ingen firma" },
  { key: "x", label: "Ej aktuell", icon: Ban, reject: true, hint: "Inte en PT, fel land, dubblett …" },
]

/**
 * Granskningskön (v55): en lead i taget. Allt som behövs för beslutet syns
 * direkt – kontaktuppgifter, länkar och det motorn hittat gratis – och beslutet
 * tas med en tangent (A, E, G, I, P, X). S hoppar över, ← går tillbaka, R
 * söker i företagsregister (kostar en sökning, körs bara på klick).
 * Ett beslut sätter bolagstypen för hand – och därmed vilka mallar som får användas.
 */
export function ReviewQueue({ leads, onSaved, onOpen }: { leads: Lead[]; onSaved: (lead: Lead) => void; onOpen: (id: string) => void }) {
  // Ordningen låses när kön öppnas, så att leads inte hoppar runt medan man granskar.
  const [order] = React.useState(() => leads.filter(needsReview).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "sv")).map((l) => l.id))
  const [index, setIndex] = React.useState(0)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [decided, setDecided] = React.useState(0)
  const [dir, setDir] = React.useState<1 | -1>(1)
  const remaining = order.filter((id) => {
    const l = leads.find((x) => x.id === id)
    return l && needsReview(l)
  })
  const currentId = order.slice(index).find((id) => {
    const l = leads.find((x) => x.id === id)
    return l && needsReview(l)
  })
  const lead = leads.find((l) => l.id === currentId)

  const next = React.useCallback(() => {
    setDir(1)
    setIndex((i) => {
      const from = order.indexOf(currentId ?? "")
      return Math.min(order.length, (from >= 0 ? from : i) + 1)
    })
  }, [order, currentId])

  const decide = React.useCallback(
    async (c: Choice) => {
      if (!lead || busy) return
      setBusy(c.key)
      try {
        const patch = c.reject ? { status: "not_relevant" as const, companyType: lead.companyType === "unknown" ? ("privatperson" as const) : lead.companyType } : { companyType: c.type! }
        const { lead: saved } = await crm<{ lead: Lead }>("lead.update", { id: lead.id, patch })
        onSaved(saved)
        setDecided((n) => n + 1)
        navigator.vibrate?.(8)
        next()
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "Kunde inte spara")
      } finally {
        setBusy(null)
      }
    },
    [lead, busy, onSaved, next]
  )

  const search = React.useCallback(async () => {
    if (!lead || busy) return
    setBusy("r")
    try {
      const { lead: saved } = await crm<{ lead: Lead }>("enrich.run", { id: lead.id, paid: true })
      onSaved(saved)
      toast(`Förslag: ${COMPANY_TYPE_LABEL[saved.companyType]}`, { description: saved.enrichment?.summary })
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Sökningen misslyckades")
    } finally {
      setBusy(null)
    }
  }, [lead, busy, onSaved])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return
      const k = e.key.toLowerCase()
      const choice = CHOICES.find((c) => c.key === k)
      if (choice) {
        e.preventDefault()
        void decide(choice)
      } else if (k === "s" || e.key === "ArrowRight") {
        e.preventDefault()
        next()
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        setDir(-1)
        setIndex((i) => Math.max(0, (order.indexOf(currentId ?? "") >= 0 ? order.indexOf(currentId!) : i) - 1))
      } else if (k === "r") {
        e.preventDefault()
        void search()
      } else if (k === "w" && lead?.websiteUrl) window.open(lead.websiteUrl, "_blank", "noopener")
      else if (k === "o" && lead?.instagram) window.open(`https://www.instagram.com/${lead.instagram}/`, "_blank", "noopener")
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [decide, next, search, order, currentId, lead])

  const total = order.length
  const pct = total ? Math.round(((total - remaining.length) / total) * 100) : 100

  if (!lead) {
    return (
      <EmptyState
        icon={CheckCheck}
        tone="done"
        title={total ? "Kön är genomgången" : "Alla leads är granskade"}
        text={decided ? `${decided} leads granskade nu. Nya leads hamnar här automatiskt.` : "Nya leads hamnar här tills bolagstypen är bekräftad."}
        data-testid="review-empty"
      />
    )
  }

  const ev = (lead.enrichment?.evidence ?? []).slice().sort((a, b) => b.weight - a.weight).slice(0, 4)
  return (
    <div className="space-y-4" data-testid="review">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite" data-testid="review-progress">
          <span className="font-semibold text-foreground tabular">{remaining.length}</span> kvar att granska{decided ? ` · ${decided} klara nu` : ""}
        </p>
        <span className="block h-1.5 w-48 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span className="block h-full origin-left rounded-full bg-primary transition-transform duration-500 ease-[var(--ease-out-soft)]" style={{ transform: `scaleX(${pct / 100})` }} />
        </span>
      </div>

      <article
        key={lead.id}
        className={cn("space-y-4 rounded-2xl border border-border/70 bg-card p-5 shadow-card animate-in fade-in-0 duration-300 motion-reduce:animate-none", dir === 1 ? "slide-in-from-right-6" : "slide-in-from-left-6")}
        data-testid="review-card"
        data-lead={lead.id}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <button type="button" className="text-left text-xl font-semibold tracking-tight hover:underline" onClick={() => onOpen(lead.id)}>
              {lead.name}
            </button>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <SegmentBadge segment={lead.segment} />
              {[lead.title, lead.gym, lead.city].filter(Boolean).join(" · ")}
            </p>
          </div>
          <ScoreBadge score={lead.score} />
        </div>

        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <Info label="E-post" value={lead.email ?? "–"} />
          <Info label="Telefon" value={lead.phone ?? "–"} />
          {lead.orgNumber && <Info label="Org.nr" value={lead.orgNumber} />}
          {lead.instagramFollowers !== null && <Info label="Följare" value={lead.instagramFollowers.toLocaleString("sv-SE")} />}
        </div>
        <div className="flex flex-wrap gap-2">
          {lead.websiteUrl && <LinkButton href={lead.websiteUrl} icon={Globe} label="Webbplats" kbd="W" />}
          {lead.instagram && <LinkButton href={`https://www.instagram.com/${lead.instagram}/`} icon={AtSign} label={`@${lead.instagram}`} kbd="O" />}
          {lead.sourceUrl && lead.sourceUrl !== lead.websiteUrl && <LinkButton href={lead.sourceUrl} icon={ExternalLink} label="Källa" />}
        </div>

        <div className="space-y-2 rounded-xl bg-muted/40 p-3" data-testid="review-suggestion">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3.5 text-primary" aria-hidden /> Motorns förslag
              <CompanyTypeBadge lead={busy === "r" ? { ...lead, enrichmentStatus: "running" } : lead} />
              {lead.enrichment && <span className="tabular">{lead.enrichment.confidence} %</span>}
            </p>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void search()} disabled={Boolean(busy)} data-testid="review-search">
              <Search /> Sök i register <Kbd>R</Kbd>
            </Button>
          </div>
          {ev.length ? (
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {ev.map((e, i) => (
                <li key={i}>
                  <span className="font-medium text-foreground/85">{SOURCE_LABEL[e.source]}:</span> {e.detail}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">{lead.enrichment?.summary ?? "Inga ledtrådar hittade gratis. Titta på webbplatsen eller sök i register."}</p>
          )}
        </div>
      </article>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" role="group" aria-label="Beslut">
        {CHOICES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => void decide(c)}
            disabled={Boolean(busy)}
            title={c.hint}
            className={cn(
              "group flex min-h-16 flex-col items-start justify-between gap-1 rounded-xl border p-3 text-left text-sm font-medium transition-[border-color,background-color,transform] duration-200 active:scale-[0.97] disabled:opacity-60",
              c.reject ? "border-border/70 text-muted-foreground hover:border-destructive/50 hover:bg-destructive/5" : "border-border/70 hover:border-primary/50 hover:bg-primary/[0.06]",
              busy === c.key && "border-primary bg-primary/10"
            )}
            data-testid={`review-${c.type ?? "reject"}`}
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <c.icon className="size-4" aria-hidden /> {c.label}
              </span>
              <Kbd>{c.key.toUpperCase()}</Kbd>
            </span>
            <span className="text-[11px] font-normal text-muted-foreground">{c.hint}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <button type="button" className="flex items-center gap-1 hover:text-foreground" onClick={() => (setDir(-1), setIndex((i) => Math.max(0, (order.indexOf(currentId ?? "") >= 0 ? order.indexOf(currentId!) : i) - 1)))}>
          <ArrowLeft className="size-3.5" aria-hidden /> Föregående <Kbd>←</Kbd>
        </button>
        <button type="button" className="flex items-center gap-1 hover:text-foreground" onClick={next} data-testid="review-skip">
          Hoppa över <Kbd>S</Kbd> <SkipForward className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <p className="min-w-0 truncate">
      <span className="text-muted-foreground">{label}:</span> <span className="font-medium">{value}</span>
    </p>
  )
}
function LinkButton({ href, icon: Icon, label, kbd }: { href: string; icon: LucideIcon; label: string; kbd?: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      <a href={href} target="_blank" rel="noopener noreferrer nofollow">
        <Icon /> <span className="max-w-48 truncate">{label}</span> {kbd ? <Kbd>{kbd}</Kbd> : <ExternalLink className="size-3 opacity-60" />}
      </a>
    </Button>
  )
}
function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-border/80 bg-muted/60 px-1 py-px font-mono text-[10px] text-muted-foreground">{children}</kbd>
}
