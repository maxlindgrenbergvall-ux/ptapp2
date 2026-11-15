"use client"

import { CheckCircle2, CircleSlash, Info, Loader2, Radar, Square } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { ApiError, crm, Field, fmtDateTime, ScoreBadge } from "@/components/crm/parts"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { parseHandles, parseHashtag } from "@/lib/crm/instagram"
import { DEFAULT_CONFIG, PROSPECT_STATUS_LABEL, type ProspectConfig, type ProspectJob } from "@/lib/crm/prospect-types"
import { CITIES } from "@/lib/crm/types"
import { cn } from "@/lib/utils"

const STEP_MS = 5000
const BIG_CITIES = CITIES.slice(0, 12)

/**
 * Driver ett pågående jobb medan CRM:et är öppet: ett steg var femte sekund.
 * (Det schemalagda anropet till /api/crm/queue gör samma sak när ingen har sidan öppen.)
 */
export function useProspectJob(enabled: boolean, onFound: () => void) {
  const [job, setJob] = React.useState<ProspectJob | null>(null)
  const found = job?.state.found.length ?? 0
  const lastFound = React.useRef(found)
  const onFoundRef = React.useRef(onFound)
  React.useEffect(() => {
    onFoundRef.current = onFound
  })

  React.useEffect(() => {
    if (!enabled) return
    crm<{ jobs: ProspectJob[] }>("prospect.list")
      .then((r) => setJob(r.jobs[0] ?? null))
      .catch(() => {})
  }, [enabled])

  const running = job?.status === "running"
  const jobId = job?.id
  React.useEffect(() => {
    if (!running || !jobId) return
    let alive = true
    let busy = false
    const tick = async () => {
      if (busy) return
      busy = true
      try {
        const r = await crm<{ job: ProspectJob | null }>("prospect.step", { id: jobId })
        if (alive && r.job) setJob(r.job)
      } catch {
        // Nätverket hackade – nästa steg försöker igen.
      } finally {
        busy = false
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), STEP_MS)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [running, jobId])

  // Nya leads hittade: hämta om listan.
  React.useEffect(() => {
    if (found > lastFound.current) onFoundRef.current()
    lastFound.current = found
  }, [found])

  return [job, setJob] as const
}

/** Kompakt rad överst i CRM:et medan ett jobb pågår (eller nyss blev klart). */
export function ProspectBanner({ job, onOpen }: { job: ProspectJob; onOpen: () => void }) {
  const { state, config, status } = job
  const pct = Math.min(100, Math.round((state.found.length / config.target) * 100))
  return (
    <button
      type="button"
      onClick={onOpen}
      className="rise-in flex w-full items-center gap-4 rounded-2xl border border-primary/30 bg-card p-4 text-left shadow-card transition-colors hover:bg-muted/30"
      data-testid="prospect-banner"
      data-status={status}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {status === "running" ? <Radar className="size-5 animate-pulse" /> : status === "done" ? <CheckCircle2 className="size-5" /> : <CircleSlash className="size-5" />}
      </span>
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-sm font-semibold">
            {status === "running" ? "Letar efter PT:er" : PROSPECT_STATUS_LABEL[status]} · <span className="tabular">{state.found.length}</span> av {config.target} hittade
          </span>
          <span className="text-xs text-muted-foreground tabular">
            {state.stats.checked} profiler granskade · {Object.values(state.stats.rejected).reduce((a, b) => a + b, 0)} bortsorterade
          </span>
        </span>
        <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
          <span className="block h-full w-full origin-left rounded-full bg-primary transition-transform duration-700 ease-[var(--ease-out-soft)]" style={{ transform: `scaleX(${pct / 100})` }} />
        </span>
      </span>
    </button>
  )
}

/** Starta ett jobb, eller följ det pågående: hittade leads, bortsorterade per skäl och logg. */
export function ProspectDialog({ open, onOpenChange, enabled, job, setJob, onOpenLead }: { open: boolean; onOpenChange: (o: boolean) => void; enabled: boolean; job: ProspectJob | null; setJob: (job: ProspectJob | null) => void; onOpenLead: (id: string) => void }) {
  const [form, setForm] = React.useState({ target: String(DEFAULT_CONFIG.target), minScore: String(DEFAULT_CONFIG.minScore), hashtags: DEFAULT_CONFIG.hashtags.join(" "), seeds: "", maxProfiles: String(DEFAULT_CONFIG.maxProfiles) })
  const [cities, setCities] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState(false)
  const [showForm, setShowForm] = React.useState(false)
  const active = job && !showForm ? job : null

  const start = async () => {
    const hashtags = form.hashtags.split(/[\s,]+/).map(parseHashtag).filter((t): t is string => Boolean(t))
    const seeds = parseHandles(form.seeds).handles
    if (!hashtags.length && !seeds.length) return void toast.error("Ange minst en hashtag eller ett känt PT-konto")
    const config: Partial<ProspectConfig> = {
      target: Math.max(1, Math.min(50, Number(form.target) || 15)),
      minScore: Math.max(1, Math.min(100, Number(form.minScore) || 50)),
      hashtags: hashtags.length ? hashtags : ["personligtränare"],
      seeds,
      cities,
      maxProfiles: Math.max(25, Math.min(1000, Number(form.maxProfiles) || 300)),
    }
    setBusy(true)
    try {
      const r = await crm<{ job: ProspectJob }>("prospect.start", { config })
      setJob(r.job)
      setShowForm(false)
      toast.success("Jobbet är igång", { description: "Det fortsätter medan CRM:et är öppet." })
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Kunde inte starta")
    } finally {
      setBusy(false)
    }
  }
  const stop = async () => {
    if (!job) return
    try {
      setJob((await crm<{ job: ProspectJob }>("prospect.stop", { id: job.id })).job)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Kunde inte stoppa")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl" data-testid="prospect-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radar className="size-4 text-primary" /> Hitta PT:er automatiskt
          </DialogTitle>
          <DialogDescription>Söker brett på Instagram i många omgångar och sparar bara konton som klarar alla krav nedan.</DialogDescription>
        </DialogHeader>

        {!enabled ? (
          <p className="flex gap-2 rounded-xl bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" /> Kräver APIFY_TOKEN i CRM-projektets miljövariabler.
          </p>
        ) : active ? (
          <JobView job={active} onOpenLead={onOpenLead} />
        ) : (
          <div className="space-y-4" data-testid="prospect-form">
            <ul className="grid gap-1.5 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground sm:grid-cols-2">
              {["Riktig personlig tränare – inte kennel, salong, butik eller en gymkedjas eget konto", "I Sverige (ort, .se, +46 eller svensk text)", "Direkt e-postadress med personens namn – aldrig info@, kontakt@ eller hej@", "E-postdomänen tar emot post (MX) och adressen är inte avregistrerad", "Inte privat och inte redan i CRM:et", "Lead Score minst det du anger"].map((t) => (
                <li key={t} className="flex gap-1.5">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" /> {t}
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Antal leads" htmlFor="pr-target">
                <Input id="pr-target" type="number" min={1} max={50} value={form.target} onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))} data-testid="prospect-target" />
              </Field>
              <Field label="Lägsta Lead Score" htmlFor="pr-score">
                <Input id="pr-score" type="number" min={1} max={100} value={form.minScore} onChange={(e) => setForm((f) => ({ ...f, minScore: e.target.value }))} />
              </Field>
              <Field label="Högst profiler (kostnad)" htmlFor="pr-max">
                <Input id="pr-max" type="number" min={25} max={1000} step={25} value={form.maxProfiles} onChange={(e) => setForm((f) => ({ ...f, maxProfiles: e.target.value }))} />
              </Field>
            </div>
            <Field label="Hashtaggar att leta i" htmlFor="pr-tags" hint="Svenska PT-hashtaggar ger bäst träffar. Mellanslag mellan.">
              <Textarea id="pr-tags" rows={2} value={form.hashtags} onChange={(e) => setForm((f) => ({ ...f, hashtags: e.target.value }))} />
            </Field>
            <Field label="Kända bra PT-konton (valfritt)" htmlFor="pr-seeds" hint="Bästa startpunkten: deras liknande konton är oftast också PT:er. Ett per rad.">
              <Textarea id="pr-seeds" rows={2} value={form.seeds} onChange={(e) => setForm((f) => ({ ...f, seeds: e.target.value }))} placeholder="@enptdugillar" data-testid="prospect-seeds" />
            </Field>
            <Field label="Orter (valfritt – tomt = hela Sverige)">
              <div className="flex flex-wrap gap-1.5">
                {BIG_CITIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={cities.includes(c)}
                    onClick={() => setCities((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]))}
                    className={cn("h-7 rounded-full border px-2.5 text-xs transition-colors", cities.includes(c) ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground hover:text-foreground")}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </Field>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Jobbet tar tid – ofta 10–30 minuter för 15 bra leads – eftersom de flesta konton sorteras bort. Det går medan CRM:et är öppet, och fortsätter där det slutade om du kommer tillbaka. Apify tar betalt per hämtat resultat.
            </p>
          </div>
        )}

        <DialogFooter>
          {enabled && active && active.status === "running" && (
            <Button variant="outline" onClick={stop} data-testid="prospect-stop">
              <Square /> Stoppa
            </Button>
          )}
          {enabled && active && active.status !== "running" && (
            <Button variant="outline" onClick={() => setShowForm(true)}>
              Nytt jobb
            </Button>
          )}
          {enabled && !active && (
            <Button onClick={start} disabled={busy} data-testid="prospect-start">
              {busy ? <Loader2 className="animate-spin" /> : <Radar />} Starta
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function JobView({ job, onOpenLead }: { job: ProspectJob; onOpenLead: (id: string) => void }) {
  const { state, config, status } = job
  const rejected = Object.entries(state.stats.rejected).sort((a, b) => b[1] - a[1])
  return (
    <div className="space-y-4" data-testid="prospect-job">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          [`${state.found.length} / ${config.target}`, "hittade"],
          [String(state.stats.checked), "profiler granskade"],
          [String(state.stats.runs), "Apify-körningar"],
        ].map(([v, l]) => (
          <div key={l} className="rounded-xl bg-muted/50 p-3">
            <p className="text-xl font-bold tabular">{v}</p>
            <p className="text-[11px] text-muted-foreground">{l}</p>
          </div>
        ))}
      </div>
      <p className="flex items-center gap-2 text-sm">
        {status === "running" ? <Loader2 className="size-4 animate-spin text-primary" /> : <CheckCircle2 className="size-4 text-primary" />}
        {PROSPECT_STATUS_LABEL[status]}
        {state.run && status === "running" && <span className="text-xs text-muted-foreground">· Apify hämtar {state.run.kind === "hashtag" ? `#${state.run.label}` : state.run.label}</span>}
      </p>
      {job.error && <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{job.error}</p>}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Hittade leads</h3>
        {state.found.length === 0 ? (
          <p className="text-xs text-muted-foreground">Inga än – de flesta konton sorteras bort, så det tar en stund.</p>
        ) : (
          <ul className="divide-y divide-border/50 rounded-xl border border-border/70" data-testid="prospect-found">
            {state.found.map((f) => (
              <li key={f.leadId} className="rise-in">
                <button type="button" onClick={() => onOpenLead(f.leadId)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{f.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      @{f.handle} · {f.email}
                      {f.city ? ` · ${f.city}` : ""}
                    </span>
                  </span>
                  <ScoreBadge score={f.score} className="shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {rejected.length > 0 && (
        <section className="space-y-1.5">
          <h3 className="text-sm font-semibold">Bortsorterade</h3>
          <ul className="space-y-1 text-xs" data-testid="prospect-rejected">
            {rejected.map(([reason, n]) => (
              <li key={reason} className="flex justify-between gap-3 text-muted-foreground">
                <span>{reason}</span>
                <span className="text-foreground tabular">{n}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">Logg</summary>
        <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto">
          {[...state.log].reverse().map((l, i) => (
            <li key={`${l.at}-${i}`}>
              <span className="tabular">{fmtDateTime(l.at)}</span> {l.text}
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
