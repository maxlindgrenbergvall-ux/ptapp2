"use client"

import { AtSign, CircleAlert, Hash, Info, Loader2, Mail, Phone, Users } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { ApiError, crm, Field, ScoreBadge, SegmentBadge } from "@/components/crm/parts"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { MAX_HASHTAG_POSTS, MAX_PROFILES_PER_RUN, parseHandles, parseHashtag, type InstagramCandidate } from "@/lib/crm/instagram"
import type { Lead } from "@/lib/crm/types"
import { cn } from "@/lib/utils"

type Candidate = InstagramCandidate & { existing: { id: string; name: string } | null }
type Mode = "profiles" | "hashtag"
const POLL_MS = 4000
const fmtNum = (n: number) => n.toLocaleString("sv-SE")

/**
 * Instagram via Apify (v49): hämta publika profiler – antingen konton du anger
 * eller kontona bakom inlägg med en hashtag – granska förslagen och lägg till de
 * du vill ha. Saknas e-post men profilen länkar till en webbplats letas adressen
 * upp där (samma hänsynsfulla hämtning som fliken Webbsida).
 */
export function InstagramPanel({ enabled, onAdded, onOpen }: { enabled: boolean; onAdded: (leads: Lead[]) => void; onOpen: (lead: Lead) => void }) {
  const [mode, setMode] = React.useState<Mode>("profiles")
  const [handlesText, setHandlesText] = React.useState("")
  const [hashtag, setHashtag] = React.useState("personligtränare")
  const [limit, setLimit] = React.useState(50)
  const [run, setRun] = React.useState<{ id: string; mode: Mode } | null>(null)
  const [polls, setPolls] = React.useState(0)
  const [candidates, setCandidates] = React.useState<Candidate[] | null>(null)
  const [picked, setPicked] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState(false)
  const [progress, setProgress] = React.useState<string | null>(null)
  const parsed = parseHandles(handlesText)

  // Läs av körningen var fjärde sekund tills den är klar (Apify tar ofta 30 s–2 min).
  React.useEffect(() => {
    if (!run) return
    let alive = true
    const tick = async () => {
      try {
        const r = await crm<{ done: boolean; error?: string; handles?: string[]; candidates?: Candidate[] }>("instagram.result", { runId: run.id, mode: run.mode })
        if (!alive) return
        if (!r.done) return void setPolls((n) => n + 1)
        setRun(null)
        if (r.error) return void toast.error(r.error)
        if (run.mode === "hashtag") {
          const found = r.handles ?? []
          if (!found.length) return void toast.info("Inga konton hittades för hashtaggen")
          setHandlesText(found.join("\n"))
          setMode("profiles")
          toast.success(`${found.length} konton hittades`, { description: "Granska listan och hämta deras profiler." })
          return
        }
        const list = r.candidates ?? []
        setCandidates(list)
        // Förvalt: tydliga tränare som inte är privata och inte redan finns.
        setPicked(new Set(list.filter((c) => c.isTrainer && !c.isPrivate && !c.existing).map((c) => c.handle)))
      } catch (e) {
        if (!alive) return
        setRun(null)
        toast.error(e instanceof ApiError ? e.message : "Kunde inte läsa av körningen")
      }
    }
    const id = window.setInterval(() => void tick(), POLL_MS)
    void tick()
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [run])

  const start = async (request: Record<string, unknown>, nextMode: Mode) => {
    setBusy(true)
    setCandidates(null)
    try {
      const r = await crm<{ runId: string }>("instagram.start", { request })
      setPolls(0)
      setRun({ id: r.runId, mode: nextMode })
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Apify kunde inte startas")
    } finally {
      setBusy(false)
    }
  }

  const add = async () => {
    const chosen = (candidates ?? []).filter((c) => picked.has(c.handle) && !c.existing)
    if (!chosen.length) return
    setBusy(true)
    const created: Lead[] = []
    let duplicates = 0
    for (const [i, c] of chosen.entries()) {
      setProgress(`Lägger till ${i + 1} av ${chosen.length} …`)
      try {
        const { lead } = await crm<{ lead: Lead }>("lead.create", { lead: c.lead })
        created.push(lead)
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) duplicates++
        else toast.error(`${c.handle}: ${e instanceof ApiError ? e.message : "kunde inte sparas"}`)
      }
    }
    // E-post saknas men webbplats finns: leta upp adressen där (en i taget, högst tio per gång).
    const needEmail = created.filter((l) => !l.email && l.websiteUrl).slice(0, 10)
    let found = 0
    for (const [i, lead] of needEmail.entries()) {
      setProgress(`Letar e-post på webbplatser ${i + 1} av ${needEmail.length} …`)
      try {
        const r = await crm<{ lead: Lead; found: boolean }>("lead.findEmail", { id: lead.id })
        created[created.findIndex((x) => x.id === lead.id)] = r.lead
        if (r.found) found++
      } catch {
        // Webbplatsen gick inte att läsa (robots.txt, fel …) – leaden finns ändå.
      }
    }
    setProgress(null)
    setBusy(false)
    onAdded(created)
    setCandidates((list) => list?.map((c) => (created.some((l) => l.instagram?.toLowerCase() === c.handle.toLowerCase()) ? { ...c, existing: { id: created.find((l) => l.instagram?.toLowerCase() === c.handle.toLowerCase())!.id, name: c.lead.name ?? c.handle } } : c)) ?? null)
    setPicked(new Set())
    toast.success(`${created.length} leads tillagda`, {
      description: [needEmail.length ? `e-post hittad på ${found} av ${needEmail.length} webbplatser` : "", duplicates ? `${duplicates} fanns redan` : ""].filter(Boolean).join(" · ") || undefined,
    })
  }

  if (!enabled) {
    return (
      <p className="flex gap-2 rounded-xl bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground" data-testid="instagram-off">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        Instagram hämtas via Apify. Lägg in APIFY_TOKEN i CRM-projektets miljövariabler i Vercel (Apify Console → Settings → API &amp; Integrations) och bygg om, så slås fliken på.
      </p>
    )
  }

  return (
    <div className="space-y-4" data-testid="instagram-panel">
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-border/70 p-0.5" role="tablist" aria-label="Hämta från Instagram">
        {(
          [
            ["profiles", AtSign, "Profiler"],
            ["hashtag", Hash, "Hashtag"],
          ] as const
        ).map(([key, Icon, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className={cn("flex h-8 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors", mode === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>

      {mode === "profiles" ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (parsed.handles.length) void start({ mode: "profiles", handles: parsed.handles }, "profiles")
          }}
        >
          <Field label="Instagram-konton" htmlFor="ig-handles" hint={`Ett per rad: @konto eller profillänk. Högst ${MAX_PROFILES_PER_RUN} per körning.`}>
            <Textarea id="ig-handles" value={handlesText} onChange={(e) => setHandlesText(e.target.value)} rows={4} placeholder={"@elin.pt\nhttps://www.instagram.com/viktorcoach/"} data-testid="ig-handles" />
          </Field>
          {parsed.invalid.length > 0 && <p className="text-xs text-warning">Ogiltiga: {parsed.invalid.slice(0, 5).join(", ")}</p>}
          <Button type="submit" className="w-full" disabled={busy || Boolean(run) || !parsed.handles.length} data-testid="ig-fetch">
            Hämta {parsed.handles.length || ""} profiler
          </Button>
        </form>
      ) : (
        <form
          className="grid grid-cols-[1fr_7rem] gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const tag = parseHashtag(hashtag)
            if (!tag) return void toast.error("Ange en hashtag med bokstäver och siffror")
            void start({ mode: "hashtag", hashtag: tag, limit }, "hashtag")
          }}
        >
          <Field label="Hashtag" htmlFor="ig-tag">
            <Input id="ig-tag" value={hashtag} onChange={(e) => setHashtag(e.target.value)} placeholder="personligtränare" data-testid="ig-hashtag" />
          </Field>
          <Field label="Antal inlägg" htmlFor="ig-limit">
            <Input id="ig-limit" type="number" min={1} max={MAX_HASHTAG_POSTS} value={limit} onChange={(e) => setLimit(Math.max(1, Math.min(MAX_HASHTAG_POSTS, Number(e.target.value) || 1)))} />
          </Field>
          <p className="col-span-2 text-[11px] leading-snug text-muted-foreground">Hittar kontona bakom de senaste inläggen. Sedan hämtar du profilerna för de konton du vill granska. Prova t.ex. personligtränare, ptstockholm, onlinecoach.</p>
          <Button type="submit" className="col-span-2" disabled={busy || Boolean(run)} data-testid="ig-search">
            Sök konton
          </Button>
        </form>
      )}

      {run && (
        <p className="rise-in flex items-center gap-2 rounded-xl bg-muted/50 p-3 text-sm" role="status" data-testid="ig-running">
          <Loader2 className="size-4 animate-spin text-primary" /> Apify hämtar från Instagram … {polls > 1 && <span className="text-xs text-muted-foreground">brukar ta 30 s–2 min</span>}
        </p>
      )}

      {candidates && (
        <div className="rise-in space-y-3" data-testid="ig-results">
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Inga profiler kunde läsas. Kontrollera kontonamnen.</p>
          ) : (
            <>
              <ul className="max-h-[42svh] space-y-2 overflow-y-auto pr-1">
                {candidates.map((c) => (
                  <li key={c.handle} className={cn("flex gap-3 rounded-xl border p-3 transition-colors", picked.has(c.handle) ? "border-primary/40 bg-primary/[0.04]" : "border-border/70", c.existing && "opacity-60")} data-testid="ig-candidate">
                    <Checkbox
                      checked={picked.has(c.handle)}
                      disabled={Boolean(c.existing)}
                      onCheckedChange={() =>
                        setPicked((s) => {
                          const n = new Set(s)
                          if (n.has(c.handle)) n.delete(c.handle)
                          else n.add(c.handle)
                          return n
                        })
                      }
                      aria-label={`Välj ${c.handle}`}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 text-sm leading-tight">
                          <span className="block truncate font-medium">{c.lead.name}</span>
                          <a href={`https://www.instagram.com/${c.handle}/`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline-offset-2 hover:underline">
                            @{c.handle}
                          </a>
                          {c.followers !== null && (
                            <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground tabular">
                              <Users className="size-3" /> {fmtNum(c.followers)}
                            </span>
                          )}
                        </p>
                        <ScoreBadge score={c.score} className="shrink-0" />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <SegmentBadge segment={c.lead.segment ?? "freelance"} />
                        {c.category && <span>{c.category}</span>}
                        {c.lead.city && <span>{c.lead.city}</span>}
                        {c.lead.email && (
                          <span className="inline-flex items-center gap-1 text-foreground">
                            <Mail className="size-3" /> {c.lead.email}
                          </span>
                        )}
                        {c.lead.phone && (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="size-3" /> {c.lead.phone}
                          </span>
                        )}
                      </div>
                      {c.bio && <p className="line-clamp-2 text-xs text-muted-foreground">{c.bio}</p>}
                      {c.existing ? (
                        <button type="button" className="text-xs text-primary underline-offset-2 hover:underline" onClick={() => crm<{ leads: Lead[] }>("bootstrap").then((b) => { const l = b.leads.find((x) => x.id === c.existing!.id); if (l) onOpen(l) })}>
                          Finns redan i CRM:et – öppna
                        </button>
                      ) : (
                        c.warnings.map((w) => (
                          <p key={w} className="flex items-center gap-1 text-[11px] text-warning">
                            <CircleAlert className="size-3" /> {w}
                          </p>
                        ))
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <Button className="w-full" onClick={add} disabled={busy || !picked.size} data-testid="ig-add">
                {busy && progress ? (
                  <>
                    <Loader2 className="animate-spin" /> {progress}
                  </>
                ) : (
                  `Lägg till ${picked.size} leads`
                )}
              </Button>
            </>
          )}
        </div>
      )}
      <p className="text-[11px] leading-snug text-muted-foreground">
        Bara publika profiler. Leads från Instagram får rättslig grund &quot;Inte bedömd&quot; – inga mejl går ut förrän ni tagit ställning (enskild firma kräver samtycke).
      </p>
    </div>
  )
}
