"use client"

import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { CheckCheck, FilePen, Radar, GripVertical, Inbox, LayoutList, Mail, MailCheck, Plus, RefreshCw, Search, Send, ShieldCheck, SquareKanban, Users, X } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { EmptyState } from "@/components/common"
import { AddLeadDialog } from "@/components/crm/add-lead-dialog"
import { LeadDrawer } from "@/components/crm/lead-drawer"
import { OutreachDialog, TemplatesDialog } from "@/components/crm/outreach-dialog"
import { ProspectBanner, ProspectDialog, useProspectJob } from "@/components/crm/prospect"
import { ApiError, crm, EmailStatusText, fmtDate, fmtDateTime, ScoreBadge, SegmentBadge, StatusBadge } from "@/components/crm/parts"
import { AnimatedNumber } from "@/components/motion"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { QueueConfig } from "@/lib/crm/outreach"
import { LEGAL_BASES, LEGAL_LABEL, SEGMENT_LABEL, SEGMENTS, STATUS_LABEL, STATUSES, type EmailLog, type EmailTemplate, type Lead, type LegalBasis, type Segment, type Status } from "@/lib/crm/types"
import { cn } from "@/lib/utils"

interface Config {
  demo: boolean
  search: boolean
  instagram: boolean
  sender: boolean
  queue: QueueConfig
}
interface Boot {
  leads: Lead[]
  templates: EmailTemplate[]
  logs: EmailLog[]
  suppressed: number
  config: Config
}
type View = "list" | "kanban" | "queue"
type ScoreFilter = "all" | "high" | "mid" | "low"
const ALL = "all"

/**
 * CRM-dashboarden (/admin/leads, v47): KPI:er, snabbfilter, lista eller
 * pipeline (kanban), sidopanel per lead och utskickskön.
 *
 * All data hämtas en gång och filtreras i webbläsaren (ett CRM av den här
 * storleken ryms gott i minnet), så filter och vybyten är omedelbara. Ändringar
 * visas direkt och rullas tillbaka om servern säger nej.
 */
export function CrmDashboard() {
  const [boot, setBoot] = React.useState<Boot | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [view, setView] = React.useState<View>("list")
  const [q, setQ] = React.useState("")
  const [segment, setSegment] = React.useState<Segment | typeof ALL>(ALL)
  const [status, setStatus] = React.useState<Status | typeof ALL>(ALL)
  const [score, setScore] = React.useState<ScoreFilter>("all")
  const [city, setCity] = React.useState(ALL)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)
  const [outreach, setOutreach] = React.useState<string[] | null>(null)
  const [editingTemplates, setEditingTemplates] = React.useState(false)
  const [prospecting, setProspecting] = React.useState(false)

  React.useEffect(() => {
    crm<Boot>("bootstrap").then(setBoot).catch(() => setFailed(true))
  }, [])
  // v50: automatisk prospektering – nya leads dyker upp i listan medan jobbet går.
  const reload = React.useCallback(() => {
    crm<Boot>("bootstrap").then((b) => setBoot((cur) => (cur ? { ...cur, leads: b.leads } : b))).catch(() => {})
  }, [])
  const [job, setJob] = useProspectJob(Boolean(boot?.config.instagram), reload)

  const leads = React.useMemo(() => boot?.leads ?? [], [boot])
  const logs = React.useMemo(() => boot?.logs ?? [], [boot])
  const setLeads = React.useCallback((fn: (leads: Lead[]) => Lead[]) => setBoot((b) => (b ? { ...b, leads: fn(b.leads) } : b)), [])
  const upsert = React.useCallback((lead: Lead) => setLeads((ls) => (ls.some((l) => l.id === lead.id) ? ls.map((l) => (l.id === lead.id ? lead : l)) : [lead, ...ls])), [setLeads])

  const cities = React.useMemo(() => [...new Set(leads.map((l) => l.city).filter((c): c is string => Boolean(c)))].sort((a, b) => a.localeCompare(b, "sv")), [leads])
  const shown = React.useMemo(() => {
    const needle = q.trim().toLowerCase()
    return leads
      .filter((l) => segment === ALL || l.segment === segment)
      .filter((l) => status === ALL || l.status === status)
      .filter((l) => city === ALL || l.city === city)
      .filter((l) => score === "all" || (score === "high" ? l.score >= 70 : score === "mid" ? l.score >= 40 && l.score < 70 : l.score < 40))
      .filter((l) => !needle || [l.name, l.email, l.gym, l.city, l.instagram, l.title, ...l.specialties].some((v) => v?.toLowerCase().includes(needle)))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "sv"))
  }, [leads, q, segment, status, city, score])

  const queued = logs.filter((l) => l.status === "queued" || l.status === "sending")

  // Kön drivs medan panelen är öppen: ett steg (högst ett mejl) var 30:e sekund när något väntar.
  // Ett schemalagt jobb mot /api/crm/queue gör samma sak när ingen har panelen öppen.
  const runQueue = React.useCallback(async (manual = false) => {
    try {
      const r = await crm<{ result: { sent: number; cancelled: number; idle?: string; error?: string }; logs: EmailLog[]; leads?: Lead[] }>("queue.run")
      setBoot((b) => (b ? { ...b, logs: r.logs, leads: r.leads ?? b.leads } : b))
      if (r.result.sent) toast.success("Ett mejl skickades")
      else if (manual) {
        const why: Record<string, string> = { not_configured: "Avsändaren är inte konfigurerad på servern", empty: "Inget i kön är dags än", gap: "Väntar – pausen mellan två mejl har inte gått", daily_cap: "Dagens tak är nått" }
        toast.info(r.result.error ?? why[r.result.idle ?? ""] ?? "Inget skickades")
      }
    } catch (e) {
      if (manual) toast.error(e instanceof ApiError ? e.message : "Kön kunde inte köras")
    }
  }, [])
  const hasQueue = queued.length > 0
  const senderOn = boot?.config.sender ?? false
  React.useEffect(() => {
    if (!hasQueue || !senderOn) return
    const id = window.setInterval(() => void runQueue(), 30_000)
    return () => window.clearInterval(id)
  }, [hasQueue, senderOn, runQueue])

  /** Ändra flera leads på en gång – visas direkt, rullas tillbaka vid fel. */
  const bulk = async (ids: string[], patch: { status?: Status; legalBasis?: LegalBasis; segment?: Segment }) => {
    const before = leads
    setLeads((ls) => ls.map((l) => (ids.includes(l.id) ? { ...l, ...patch } : l)))
    try {
      const { leads: saved } = await crm<{ leads: Lead[] }>("lead.bulk", { ids, patch })
      setLeads((ls) => ls.map((l) => saved.find((s) => s.id === l.id) ?? l))
    } catch (e) {
      setLeads(() => before)
      toast.error(e instanceof ApiError ? e.message : "Kunde inte spara")
    }
  }

  if (failed) return <EmptyState icon={X} title="CRM:et kunde inte laddas" text="Ladda om sidan. Fortsätter det: kontrollera att migrationen v47 är körd och att ditt konto är administratör." />
  if (!boot) return <Skeleton />

  const kpi = {
    total: leads.length,
    verified: leads.filter((l) => l.email && l.emailVerified === true).length,
    contacted: leads.filter((l) => l.lastEmailedAt || ["emailed", "replied", "customer"].includes(l.status)).length,
    customers: leads.filter((l) => l.status === "customer").length,
  }
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const allShownSelected = shown.length > 0 && shown.every((l) => selected.has(l.id))
  const selectedIds = [...selected].filter((id) => leads.some((l) => l.id === id))
  const filtered = q || segment !== ALL || status !== ALL || score !== "all" || city !== ALL

  return (
    <div className="space-y-6" data-testid="crm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Leads</h1>
          <p className="text-sm text-muted-foreground">Personliga tränare i Sverige – frilans, influencers och gymkedjor.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setProspecting(true)} data-testid="open-prospect">
            <Radar /> Hitta PT:er
          </Button>
          <Button variant="outline" onClick={() => setEditingTemplates(true)} data-testid="open-templates">
            <FilePen /> Mallar
          </Button>
          <Button onClick={() => setAdding(true)} data-testid="open-add">
            <Plus /> Lägg till leads
          </Button>
        </div>
      </div>

      {job && (job.status === "running" || job.state.found.length > 0) && <ProspectBanner job={job} onOpen={() => setProspecting(true)} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="kpis">
        <Kpi icon={Users} label="Leads totalt" value={kpi.total} />
        <Kpi icon={ShieldCheck} label="Verifierade e-postadresser" value={kpi.verified} of={kpi.total} />
        <Kpi icon={MailCheck} label="Kontaktade" value={kpi.contacted} of={kpi.total} />
        <Kpi icon={CheckCheck} label="Konverterade PT:er" value={kpi.customers} of={kpi.total} accent />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök namn, e-post, gym, ort …" className="pl-9" aria-label="Sök bland leads" data-testid="crm-search" />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as Status | typeof ALL)}>
            <SelectTrigger className="w-44" aria-label="Filtrera på status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alla statusar</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={score} onValueChange={(v) => setScore(v as ScoreFilter)}>
            <SelectTrigger className="w-40" aria-label="Filtrera på lead score">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla poäng</SelectItem>
              <SelectItem value="high">Hög (70–100)</SelectItem>
              <SelectItem value="mid">Medel (40–69)</SelectItem>
              <SelectItem value="low">Låg (under 40)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={city} onValueChange={setCity}>
            <SelectTrigger className="w-40" aria-label="Filtrera på ort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alla orter</SelectItem>
              {cities.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto flex rounded-lg border border-border/70 p-0.5" role="tablist" aria-label="Vy">
            {(
              [
                ["list", LayoutList, "Lista"],
                ["kanban", SquareKanban, "Pipeline"],
                ["queue", Send, `Utskick${queued.length ? ` (${queued.length})` : ""}`],
              ] as const
            ).map(([key, Icon, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                onClick={() => setView(key)}
                data-testid={`view-${key}`}
                className={cn("flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors duration-200", view === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <Icon className="size-4" /> <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Segment">
          <Chip active={segment === ALL} onClick={() => setSegment(ALL)}>
            Alla <Count n={leads.length} />
          </Chip>
          {SEGMENTS.map((s) => (
            <Chip key={s} active={segment === s} onClick={() => setSegment(s)} testId={`seg-${s}`}>
              {s === "gym_chain" ? "SATS / Nordic Wellness m.fl." : SEGMENT_LABEL[s]} <Count n={leads.filter((l) => l.segment === s).length} />
            </Chip>
          ))}
          {filtered && (
            <button
              type="button"
              className="ml-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => {
                setQ("")
                setSegment(ALL)
                setStatus(ALL)
                setScore("all")
                setCity(ALL)
              }}
            >
              Rensa filter
            </button>
          )}
        </div>
      </div>

      {selectedIds.length > 0 && view !== "queue" && (
        <div className="rise-in sticky top-[calc(3.5rem+var(--safe-top)+0.5rem)] z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/30 bg-card p-2 pl-4 shadow-float" data-testid="bulk-bar">
          <span className="text-sm font-medium">{selectedIds.length} valda</span>
          <Select value="" onValueChange={(v) => void bulk(selectedIds, { status: v as Status })}>
            <SelectTrigger className="h-8 w-40" aria-label="Sätt status på valda">
              <SelectValue placeholder="Sätt status" />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value="" onValueChange={(v) => void bulk(selectedIds, { legalBasis: v as LegalBasis })}>
            <SelectTrigger className="h-8 w-44" aria-label="Sätt rättslig grund på valda" data-testid="bulk-legal">
              <SelectValue placeholder="Rättslig grund" />
            </SelectTrigger>
            <SelectContent>
              {LEGAL_BASES.map((b) => (
                <SelectItem key={b} value={b}>
                  {LEGAL_LABEL[b]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" onClick={() => setOutreach(selectedIds)} data-testid="bulk-outreach">
              <Mail /> Förhandsgranska &amp; schemalägg utskick
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="Avmarkera alla" onClick={() => setSelected(new Set())}>
              <X />
            </Button>
          </div>
        </div>
      )}

      {view === "list" && (
        <LeadTable
          leads={shown}
          selected={selected}
          onToggle={toggle}
          allSelected={allShownSelected}
          onToggleAll={() => setSelected(allShownSelected ? new Set() : new Set(shown.map((l) => l.id)))}
          onOpen={setOpenId}
          empty={
            leads.length === 0 ? (
              <EmptyState icon={Inbox} title="Inga leads än" text="Börja med en PT:s webbplats – parsern föreslår kontaktuppgifterna och du granskar dem." action={<Button onClick={() => setAdding(true)}><Plus /> Lägg till leads</Button>} />
            ) : (
              <EmptyState compact icon={Search} title="Inga leads matchar filtren" text="Prova att ta bort ett filter." />
            )
          }
        />
      )}
      {view === "kanban" && <Kanban leads={shown} onOpen={setOpenId} onMove={(id, to) => void bulk([id], { status: to })} />}
      {view === "queue" && (
        <QueuePanel
          logs={logs}
          leads={leads}
          config={boot.config}
          suppressed={boot.suppressed}
          due={hasQueue}
          onRun={() => void runQueue(true)}
          onOpen={setOpenId}
          onCancel={async (id) => {
            try {
              await crm("queue.cancel", { id })
              setBoot((b) => (b ? { ...b, logs: b.logs.map((l) => (l.id === id ? { ...l, status: "cancelled" as const } : l)) } : b))
            } catch (e) {
              toast.error(e instanceof ApiError ? e.message : "Kunde inte avbryta")
            }
          }}
        />
      )}

      <LeadDrawer
        lead={leads.find((l) => l.id === openId) ?? null}
        onClose={() => setOpenId(null)}
        onSaved={upsert}
        onDeleted={(id) => {
          setLeads((ls) => ls.filter((l) => l.id !== id))
          setOpenId(null)
        }}
      />
      <AddLeadDialog
        open={adding}
        onOpenChange={setAdding}
        searchEnabled={boot.config.search}
        instagramEnabled={boot.config.instagram}
        onCreated={(lead) => {
          upsert(lead)
          setOpenId(lead.id)
        }}
        onImported={(created) => setLeads((ls) => [...created, ...ls])}
        onDuplicate={(lead) => {
          upsert(lead)
          setOpenId(lead.id)
        }}
      />
      <OutreachDialog
        open={Boolean(outreach)}
        onOpenChange={(o) => !o && setOutreach(null)}
        leadIds={outreach ?? []}
        templates={boot.templates}
        onScheduled={(created) => {
          setBoot((b) => (b ? { ...b, logs: [...created, ...b.logs] } : b))
          setSelected(new Set())
          setView("queue")
        }}
      />
      <ProspectDialog
        open={prospecting}
        onOpenChange={setProspecting}
        enabled={boot.config.instagram}
        job={job}
        setJob={setJob}
        onOpenLead={(id) => {
          setProspecting(false)
          if (leads.some((l) => l.id === id)) setOpenId(id)
          else crm<Boot>("bootstrap").then((b) => {
            setBoot((cur) => (cur ? { ...cur, leads: b.leads } : b))
            setOpenId(id)
          })
        }}
      />
      <TemplatesDialog open={editingTemplates} onOpenChange={setEditingTemplates} templates={boot.templates} onChange={(templates) => setBoot((b) => (b ? { ...b, templates } : b))} />
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Laddar leads">
      <div className="h-10 w-48 rounded-xl skeleton" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl skeleton" />
        ))}
      </div>
      <div className="h-96 rounded-2xl skeleton" />
    </div>
  )
}

function Kpi({ icon: Icon, label, value, of, accent }: { icon: typeof Users; label: string; value: number; of?: number; accent?: boolean }) {
  return (
    <div className={cn("rounded-2xl border bg-card p-4 shadow-card", accent ? "border-primary/30" : "border-border/70")}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5 text-primary" aria-hidden /> {label}
      </p>
      <p className="mt-2 flex items-baseline gap-2">
        <AnimatedNumber value={value} className={cn("text-3xl font-bold tracking-tight tabular", accent && "text-primary")} />
        {of !== undefined && of > 0 && <span className="text-xs text-muted-foreground tabular">{Math.round((value / of) * 100)} %</span>}
      </p>
    </div>
  )
}

function Chip({ active, onClick, children, testId }: { active: boolean; onClick: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      data-testid={testId}
      className={cn("flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-[background-color,border-color,color,scale] duration-200 active:scale-95", active ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground hover:text-foreground")}
    >
      {children}
    </button>
  )
}
const Count = ({ n }: { n: number }) => <span className="text-xs tabular opacity-70">{n}</span>

// ---------------------------------------------------------------- lista ---
function LeadTable({ leads, selected, onToggle, allSelected, onToggleAll, onOpen, empty }: { leads: Lead[]; selected: Set<string>; onToggle: (id: string) => void; allSelected: boolean; onToggleAll: () => void; onOpen: (id: string) => void; empty: React.ReactNode }) {
  if (leads.length === 0) return <>{empty}</>
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm" data-testid="lead-table">
          <thead>
            <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
              <th className="w-10 py-2.5 pl-4">
                <Checkbox checked={allSelected} onCheckedChange={onToggleAll} aria-label="Markera alla som visas" />
              </th>
              <th className="py-2.5 pr-3 font-medium">Namn</th>
              <th className="py-2.5 pr-3 font-medium">Segment</th>
              <th className="py-2.5 pr-3 font-medium">Kontakt</th>
              <th className="py-2.5 pr-3 font-medium">Status</th>
              <th className="py-2.5 pr-4 text-right font-medium">Score</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr
                key={l.id}
                data-testid="lead-row"
                data-selected={selected.has(l.id) || undefined}
                onClick={() => onOpen(l.id)}
                className={cn("cursor-pointer border-b border-border/50 transition-colors duration-150 last:border-0 hover:bg-muted/40", selected.has(l.id) && "bg-primary/[0.06]")}
              >
                <td className="py-3 pl-4" onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={selected.has(l.id)} onCheckedChange={() => onToggle(l.id)} aria-label={`Markera ${l.name}`} />
                </td>
                <td className="py-3 pr-3">
                  <button type="button" className="block max-w-[16rem] truncate text-left font-medium outline-none focus-visible:underline" onClick={(e) => (e.stopPropagation(), onOpen(l.id))}>
                    {l.name}
                  </button>
                  <span className="block max-w-[16rem] truncate text-xs text-muted-foreground">{[l.title, l.gym, l.city].filter(Boolean).join(" · ") || "–"}</span>
                </td>
                <td className="py-3 pr-3">
                  <SegmentBadge segment={l.segment} />
                </td>
                <td className="py-3 pr-3">
                  {l.email ? (
                    <span className="flex max-w-[15rem] items-center gap-1.5">
                      <span className="truncate">{l.email}</span>
                      {l.emailVerified === true && <ShieldCheck className="size-3.5 shrink-0 text-primary" aria-label="Domänen tar emot e-post" />}
                      {l.emailVerified === false && <X className="size-3.5 shrink-0 text-destructive" aria-label="Domänen tar inte emot e-post" />}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{l.instagram ? `@${l.instagram}` : (l.phone ?? "–")}</span>
                  )}
                  {l.legalBasis === "unknown" && l.email && <span className="block text-[11px] text-warning">Rättslig grund inte bedömd</span>}
                </td>
                <td className="py-3 pr-3">
                  <StatusBadge status={l.status} />
                </td>
                <td className="py-3 pr-4">
                  <ScoreBadge score={l.score} className="justify-end" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// --------------------------------------------------------------- kanban ---
function Kanban({ leads, onOpen, onMove }: { leads: Lead[]; onOpen: (id: string) => void; onMove: (id: string, to: Status) => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const lead = leads.find((l) => l.id === active.id)
    if (lead && over && STATUSES.includes(over.id as Status) && lead.status !== over.id) onMove(lead.id, over.id as Status)
  }
  return (
    <DndContext sensors={sensors} onDragStart={() => navigator.vibrate?.(10)} onDragEnd={onDragEnd}>
      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
        <div className="grid min-w-[1180px] grid-cols-6 gap-3" data-testid="kanban">
          {STATUSES.map((s) => (
            <Column key={s} status={s} leads={leads.filter((l) => l.status === s)} onOpen={onOpen} />
          ))}
        </div>
      </div>
    </DndContext>
  )
}

function Column({ status, leads, onOpen }: { status: Status; leads: Lead[]; onOpen: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <section ref={setNodeRef} data-testid={`col-${status}`} aria-label={STATUS_LABEL[status]} className={cn("flex min-h-64 flex-col gap-2 rounded-2xl border p-2 transition-colors duration-200", isOver ? "border-primary/60 bg-primary/[0.06]" : "border-border/70 bg-card/40")}>
      <h3 className="flex items-center justify-between px-1.5 pt-1 text-xs font-semibold">
        {STATUS_LABEL[status]} <span className="font-normal text-muted-foreground tabular">{leads.length}</span>
      </h3>
      {leads.map((l) => (
        <Card key={l.id} lead={l} onOpen={onOpen} />
      ))}
      {leads.length === 0 && <p className="px-1.5 py-6 text-center text-xs text-muted-foreground">Dra hit</p>}
    </section>
  )
}

function Card({ lead, onOpen }: { lead: Lead; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({ id: lead.id })
  return (
    <article
      ref={setNodeRef}
      data-testid="kanban-card"
      style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined }}
      className={cn("rounded-xl border border-border/70 bg-card p-2.5 text-left shadow-card transition-[box-shadow,scale] duration-200", isDragging && "relative z-30 scale-[1.03] shadow-float ring-2 ring-primary/40")}
    >
      <div className="flex items-start gap-1.5">
        <button type="button" onClick={() => onOpen(lead.id)} className="min-w-0 flex-1 text-left outline-none focus-visible:underline">
          <span className="block truncate text-sm font-medium">{lead.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{[lead.gym, lead.city].filter(Boolean).join(" · ") || SEGMENT_LABEL[lead.segment]}</span>
        </button>
        <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={`Flytta ${lead.name}`} className="-mt-0.5 -mr-1 flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:cursor-grabbing">
          <GripVertical className="size-4" />
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <SegmentBadge segment={lead.segment} />
        <ScoreBadge score={lead.score} />
      </div>
    </article>
  )
}

// ------------------------------------------------------------------ kö ---
function QueuePanel({ logs, leads, config, suppressed, due, onRun, onCancel, onOpen }: { logs: EmailLog[]; leads: Lead[]; config: Config; suppressed: number; due: boolean; onRun: () => void; onCancel: (id: string) => void; onOpen: (id: string) => void }) {
  const queue = config.queue
  return (
    <div className="space-y-4" data-testid="queue">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-card">
        <div className="min-w-0 text-sm">
          <p className="font-medium">Utskickskö</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Ett mejl i taget, minst {queue.minGapSeconds} s emellan, högst {queue.dailyCap} per dygn, vardagar kl. {queue.windowStartHour}–{queue.windowEndHour}. Kön går medan den här sidan är öppen
            {config.sender ? "" : " – men avsändaren är inte konfigurerad på servern, så inget skickas än"}. {suppressed > 0 && `${suppressed} adresser är spärrade (avregistrerade eller studsade).`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRun} disabled={!due || !config.sender} data-testid="queue-run">
          <RefreshCw /> Kör kön nu
        </Button>
      </div>
      {logs.length === 0 ? (
        <EmptyState icon={Send} title="Inga utskick än" text="Markera leads i listan och välj Förhandsgranska & schemalägg utskick." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
          <ul className="divide-y divide-border/50" data-testid="queue-list">
            {logs.map((l) => {
              const lead = leads.find((x) => x.id === l.leadId)
              return (
                <li key={l.id} className="flex items-center gap-3 px-4 py-3 text-sm" data-status={l.status}>
                  <span className="min-w-0 flex-1">
                    <button type="button" className="block max-w-full truncate text-left font-medium outline-none focus-visible:underline" onClick={() => lead && onOpen(lead.id)}>
                      {lead?.name ?? l.toEmail}
                    </button>
                    <span className="block truncate text-xs text-muted-foreground">{l.subject}</span>
                    {l.error && l.status !== "cancelled" && <span className="block truncate text-xs text-destructive">{l.error}</span>}
                  </span>
                  <span className="shrink-0 text-right">
                    <EmailStatusText status={l.status} />
                    <span className="block text-[11px] text-muted-foreground tabular">{l.status === "queued" ? `planerat ${fmtDateTime(l.scheduledAt)}` : l.deliveredAt ? `levererat ${fmtDateTime(l.deliveredAt)}` : l.sentAt ? `skickat ${fmtDateTime(l.sentAt)}` : fmtDate(l.scheduledAt)}</span>
                  </span>
                  {l.status === "queued" ? (
                    <Button size="icon-sm" variant="ghost" aria-label={`Avbryt mejlet till ${lead?.name ?? l.toEmail}`} onClick={() => onCancel(l.id)}>
                      <X />
                    </Button>
                  ) : (
                    <span className="w-8" />
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
