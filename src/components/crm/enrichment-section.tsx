"use client"

import { BadgeCheck, ChevronDown, ExternalLink, Info, RefreshCw, Search, ShieldAlert, Sparkles, Wand2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { ApiError, CompanyTypeBadge, crm, Field, fmtDateTime } from "@/components/crm/parts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { recommendation } from "@/lib/crm/compliance"
import { COMPANY_TYPE_LABEL, COMPANY_TYPES, SOURCE_LABEL, type CompanyType } from "@/lib/crm/enrichment/decide"
import type { Lead, LeadInput } from "@/lib/crm/types"
import { cn } from "@/lib/utils"

const AUTO = "auto"

/**
 * Bolagstyp och roll i lead-panelen (v54): motorns slutsats med bevis och
 * säkerhet, "Kör igen", och möjligheten att sätta typen för hand (då ändrar
 * motorn den inte längre – "Automatisk" lämnar tillbaka den).
 */
export function EnrichmentSection({ lead, busy, onUpdate, onSaved }: { lead: Lead; busy: boolean; onUpdate: (patch: LeadInput, message?: string) => Promise<void>; onSaved: (lead: Lead) => void }) {
  const [running, setRunning] = React.useState(false)
  const [org, setOrg] = React.useState(lead.orgNumber ?? "")
  const [showSkipped, setShowSkipped] = React.useState(false)
  const r = lead.enrichment
  const working = running || lead.enrichmentStatus === "running"

  const run = async (action: "enrich.run" | "enrich.reset", paid = false) => {
    setRunning(true)
    onSaved({ ...lead, enrichmentStatus: "running" })
    try {
      const { lead: saved } = await crm<{ lead: Lead }>(action, action === "enrich.run" ? { id: lead.id, paid } : { id: lead.id })
      onSaved(saved)
      toast.success(`${COMPANY_TYPE_LABEL[saved.companyType]}${saved.enrichment ? ` · ${saved.enrichment.confidence} % säker` : ""}`, { description: saved.enrichment?.summary })
    } catch (e) {
      onSaved(lead)
      toast.error(e instanceof ApiError ? e.message : "Berikningen misslyckades")
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="col-span-2 space-y-3" data-testid="enrichment">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <CompanyTypeBadge lead={working ? { ...lead, enrichmentStatus: "running" } : lead} className="h-6 px-2 text-[11px]" />
          {lead.verifiedAt && (
            <span className="inline-flex items-center gap-1 text-[11px] text-primary" data-testid="verified">
              <BadgeCheck className="size-3.5" aria-hidden /> Bolagsverket
            </span>
          )}
          {r && !working && <span className="text-[11px] text-muted-foreground tabular">{r.confidence} % säker</span>}
        </div>
        {lead.companyTypeManual ? (
          <Button variant="outline" size="sm" className="h-7" disabled={working || busy} onClick={() => void run("enrich.reset")} data-testid="enrich-reset">
            <Wand2 /> Automatisk
          </Button>
        ) : (
          <span className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-7" disabled={working || busy} onClick={() => void run("enrich.run")} data-testid="enrich-run" title="Gratis källor: uppgifterna, webbplatsen och Bolagsverket">
              {working ? <Sparkles className="animate-pulse" /> : <RefreshCw />} {lead.enrichedAt ? "Kör igen" : "Auto-berika"}
            </Button>
            <Button variant="outline" size="sm" className="h-7" disabled={working || busy} onClick={() => void run("enrich.run", true)} data-testid="enrich-search" title="Söker på allabolag (och vid behov bredare) med personens namn – kostar en eller två sökningar">
              <Search /> Sök i register
            </Button>
          </span>
        )}
      </div>

      {working ? (
        <div className="space-y-1.5" aria-live="polite" data-testid="enrich-working">
          {["Leadens uppgifter", "Webbplats", "Företagsregister", "Bolagsverket"].map((label, i) => (
            <div key={label} className="enrich-sweep flex h-7 items-center rounded-lg bg-muted/40 px-2.5 text-[11px] text-muted-foreground" style={{ animationDelay: `${i * 120}ms` }}>
              {label} …
            </div>
          ))}
        </div>
      ) : r ? (
        <div className="space-y-2">
          <p className={cn("text-xs leading-relaxed", lead.enrichmentStatus === "needs_review" ? "text-warning" : "text-foreground/90")} data-testid="enrich-summary">
            {r.summary}
          </p>
          {r.evidence.length > 0 && (
            <ul className="space-y-1" data-testid="evidence">
              {r.evidence
                .slice()
                .sort((a, b) => b.weight - a.weight)
                .slice(0, 6)
                .map((e, i) => (
                  <li key={i} className="rise-in flex items-start gap-2 text-[11px]" style={{ animationDelay: `${i * 40}ms` }}>
                    <span className="mt-1 block h-1 w-8 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <span className="block h-full origin-left rounded-full bg-primary transition-transform duration-700" style={{ transform: `scaleX(${e.weight / 100})` }} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-foreground/90">{SOURCE_LABEL[e.source]}:</span> <span className="text-muted-foreground">{e.detail}</span>
                    </span>
                    {e.url && (
                      <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Öppna källan">
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </li>
                ))}
            </ul>
          )}
          {r.skipped.length > 0 && (
            <div>
              <button type="button" className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground" onClick={() => setShowSkipped((v) => !v)} aria-expanded={showSkipped}>
                <Info className="size-3" aria-hidden /> {r.skipped.length} {r.skipped.length === 1 ? "källa" : "källor"} hoppades över
                <ChevronDown className={cn("size-3 transition-transform", showSkipped && "rotate-180")} aria-hidden />
              </button>
              {showSkipped && (
                <ul className="rise-in mt-1 space-y-0.5 pl-4 text-[11px] text-muted-foreground" data-testid="skipped">
                  {r.skipped.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {lead.enrichedAt && <p className="text-[10px] text-muted-foreground">Senast {fmtDateTime(lead.enrichedAt)}</p>}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Inte berikad än.</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Bolagstyp (för hand)">
          <Select
            value={lead.companyTypeManual ? lead.companyType : AUTO}
            onValueChange={(v) => (v === AUTO ? void run("enrich.reset") : void onUpdate({ companyType: v as CompanyType }, `${COMPANY_TYPE_LABEL[v as CompanyType]} – satt för hand`))}
            disabled={busy || working}
          >
            <SelectTrigger className="w-full" aria-label="Bolagstyp" data-testid="drawer-company-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUTO}>Automatisk (motorn)</SelectItem>
              {COMPANY_TYPES.filter((t) => t !== "unknown").map((t) => (
                <SelectItem key={t} value={t}>
                  {COMPANY_TYPE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {lead.companyForm === "ab" ? (
          <Field label="Org.nr (aktiebolag)" htmlFor="org-nr">
            <Input
              id="org-nr"
              value={org}
              inputMode="numeric"
              placeholder="5591234567"
              maxLength={11}
              onChange={(e) => setOrg(e.target.value)}
              onBlur={() => org.trim() !== (lead.orgNumber ?? "") && void onUpdate({ orgNumber: org.trim() || null }, "Organisationsnumret är sparat")}
              data-testid="drawer-org-nr"
            />
          </Field>
        ) : (
          <p className="self-end pb-2 text-[11px] leading-snug text-muted-foreground">Personnummer sparas aldrig.</p>
        )}
      </div>
      <p className={cn("flex gap-2 rounded-xl px-3 py-2 text-xs leading-relaxed", lead.companyForm === "enskild" && lead.legalBasis === "company" ? "bg-destructive/10 text-destructive" : "bg-primary/[0.07] text-foreground/90")} data-testid="recommendation">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
        {lead.legalBasis === "research" && lead.companyForm !== "enskild"
          ? "Låst till den icke-säljande referensgruppsmallen eller Instagram-DM tills ett aktiebolag är bekräftat."
          : recommendation(lead)}
      </p>
    </div>
  )
}
