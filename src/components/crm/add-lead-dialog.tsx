"use client"

import { AtSign, FileUp, Globe, Info, Plus, Search, Sparkles } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { InstagramPanel } from "@/components/crm/instagram-panel"
import { patchFromForm } from "@/components/crm/lead-drawer"
import { ApiError, crm, Field, ScoreBadge } from "@/components/crm/parts"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { leadsFromCsv, type CsvResult } from "@/lib/crm/csv"
import { CITIES, GYM_CHAINS, SEGMENT_LONG, SEGMENTS, SPECIALTIES, type Lead, type LeadInput, type ScorePart, type Segment } from "@/lib/crm/types"

interface Enriched {
  suggestion: LeadInput
  found: { emails: string[]; phones: string[] }
  score: number
  breakdown: ScorePart[]
  pages: string[]
  notes: string[]
}
interface Candidate {
  title: string
  url: string
  host: string
  snippet: string
  socialOnly: boolean
}
type Form = { name: string; title: string; email: string; phone: string; instagram: string; websiteUrl: string; gym: string; city: string; specialties: string }
const EMPTY: Form = { name: "", title: "", email: "", phone: "", instagram: "", websiteUrl: "", gym: "", city: "", specialties: "" }
const formOf = (s: LeadInput): Form => ({ name: s.name ?? "", title: s.title ?? "", email: s.email ?? "", phone: s.phone ?? "", instagram: s.instagram ?? "", websiteUrl: s.websiteUrl ?? "", gym: s.gym ?? "", city: s.city ?? "", specialties: (s.specialties ?? []).join(", ") })

/**
 * Lägg till leads på fyra sätt: från en publik webbsida (parsern föreslår, du
 * granskar), manuellt, via CSV eller – om ett sök-API är konfigurerat – från en
 * sökning. Dubbletter stoppas av servern och den befintliga leaden öppnas.
 */
export function AddLeadDialog({
  open,
  onOpenChange,
  searchEnabled,
  instagramEnabled,
  onCreated,
  onImported,
  onDuplicate,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  searchEnabled: boolean
  instagramEnabled: boolean
  onCreated: (lead: Lead) => void
  onImported: (leads: Lead[]) => void
  onDuplicate: (lead: Lead) => void
}) {
  const [tab, setTab] = React.useState("url")
  const [url, setUrl] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [enriched, setEnriched] = React.useState<Enriched | null>(null)
  const [form, setForm] = React.useState<Form>(EMPTY)
  const [segment, setSegment] = React.useState<Segment>("freelance")
  const [csv, setCsv] = React.useState<(CsvResult & { file: string }) | null>(null)
  const [query, setQuery] = React.useState<{ segment: Segment; city: string; specialty: string; gym: string }>({ segment: "freelance", city: "Stockholm", specialty: "", gym: "SATS" })
  const [candidates, setCandidates] = React.useState<Candidate[] | null>(null)
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const reset = () => {
    setUrl("")
    setEnriched(null)
    setForm(EMPTY)
    setCsv(null)
    setCandidates(null)
  }

  const enrich = async (target: string) => {
    if (!target.trim()) return
    setBusy(true)
    setEnriched(null)
    try {
      const result = await crm<Enriched>("enrich.preview", { url: target.trim() })
      setEnriched(result)
      setForm(formOf(result.suggestion))
      setSegment(result.suggestion.segment ?? "freelance")
      setTab("url")
      setUrl(target.trim())
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Kunde inte hämta sidan")
    } finally {
      setBusy(false)
    }
  }

  const create = async (source: "manual" | "url") => {
    const result = patchFromForm(form)
    if ("error" in result) return toast.error(result.error)
    setBusy(true)
    try {
      const lead: LeadInput = { ...result.patch, segment, source, ...(source === "url" && enriched ? { sourceUrl: enriched.suggestion.sourceUrl, emailVerified: result.patch.email === enriched.suggestion.email ? enriched.suggestion.emailVerified : undefined } : {}) }
      const { lead: saved } = await crm<{ lead: Lead }>("lead.create", { lead })
      onCreated(saved)
      toast.success(`${saved.name} är tillagd`)
      reset()
      onOpenChange(false)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.data.duplicate) {
        toast.info(e.message, { description: "Öppnar den befintliga leaden." })
        onDuplicate(e.data.duplicate as Lead)
        onOpenChange(false)
      } else toast.error(e instanceof ApiError ? e.message : "Kunde inte spara")
    } finally {
      setBusy(false)
    }
  }

  const importCsv = async () => {
    if (!csv?.leads.length) return
    setBusy(true)
    try {
      const r = await crm<{ leads: Lead[]; duplicates: number; blocked: number }>("lead.import", { leads: csv.leads })
      onImported(r.leads)
      toast.success(`${r.leads.length} leads importerade`, { description: [r.duplicates && `${r.duplicates} dubbletter hoppades över`, r.blocked && `${r.blocked} avregistrerade adresser stoppades`].filter(Boolean).join(" · ") || undefined })
      reset()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Importen misslyckades")
    } finally {
      setBusy(false)
    }
  }

  const search = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const { candidates: found } = await crm<{ candidates: Candidate[] }>("search", { query: { segment: query.segment, city: query.city || undefined, specialty: query.specialty || undefined, gym: query.segment === "gym_chain" ? query.gym : undefined } })
      setCandidates(found)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Sökningen misslyckades")
    } finally {
      setBusy(false)
    }
  }

  const fields = (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Namn" htmlFor="al-name" className="col-span-2">
        <Input id="al-name" value={form.name} onChange={set("name")} maxLength={160} />
      </Field>
      <Field label="Segment" className="col-span-2">
        <Select value={segment} onValueChange={(v) => setSegment(v as Segment)}>
          <SelectTrigger className="w-full" aria-label="Segment">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SEGMENTS.map((s) => (
              <SelectItem key={s} value={s}>
                {SEGMENT_LONG[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="E-post" htmlFor="al-email" className="col-span-2">
        <Input id="al-email" type="email" value={form.email} onChange={set("email")} list="al-emails" />
        {enriched && enriched.found.emails.length > 1 && (
          <datalist id="al-emails">
            {enriched.found.emails.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
        )}
      </Field>
      <Field label="Titel / roll" htmlFor="al-title">
        <Input id="al-title" value={form.title} onChange={set("title")} />
      </Field>
      <Field label="Telefon" htmlFor="al-phone">
        <Input id="al-phone" type="tel" value={form.phone} onChange={set("phone")} placeholder="070-123 45 67" />
      </Field>
      <Field label="Gym / företag" htmlFor="al-gym">
        <Input id="al-gym" value={form.gym} onChange={set("gym")} />
      </Field>
      <Field label="Ort" htmlFor="al-city">
        <Input id="al-city" value={form.city} onChange={set("city")} list="al-cities" />
        <datalist id="al-cities">
          {CITIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field label="Instagram" htmlFor="al-ig">
        <Input id="al-ig" value={form.instagram} onChange={set("instagram")} placeholder="kontonamn eller profillänk" />
      </Field>
      <Field label="Webbplats" htmlFor="al-web">
        <Input id="al-web" value={form.websiteUrl} onChange={set("websiteUrl")} placeholder="https://…" />
      </Field>
      <Field label="Specialiseringar" htmlFor="al-spec" className="col-span-2">
        <Input id="al-spec" value={form.specialties} onChange={set("specialties")} placeholder="Styrka, Rehab" />
      </Field>
    </div>
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-xl" data-testid="add-lead">
        <DialogHeader>
          <DialogTitle>Lägg till leads</DialogTitle>
          <DialogDescription>Bara publika uppgifter som personen själv lagt ut för kontakt i sin yrkesroll.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="url">
              <Globe /> Webbsida
            </TabsTrigger>
            <TabsTrigger value="manual">
              <Plus /> Manuellt
            </TabsTrigger>
            <TabsTrigger value="csv">
              <FileUp /> CSV
            </TabsTrigger>
            <TabsTrigger value="search">
              <Search /> Sök
            </TabsTrigger>
            <TabsTrigger value="instagram" data-testid="tab-instagram">
              <AtSign /> Instagram
            </TabsTrigger>
          </TabsList>

          <TabsContent value="url" className="space-y-4 pt-2">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void enrich(url)
              }}
            >
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="elinpt.se eller linktr.ee/…" aria-label="Webbadress" inputMode="url" autoComplete="off" data-testid="enrich-url" />
              <Button type="submit" disabled={busy || !url.trim()} data-testid="enrich-go">
                <Sparkles /> {busy && !enriched ? "Hämtar …" : "Hämta"}
              </Button>
            </form>
            {!enriched && (
              <p className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                Ange en PT:s egen webbplats eller länk-i-bio-sida. Sidan hämtas en gång och robots.txt respekteras. Sociala nätverk hämtas inte här – Instagram-profiler hämtar du under fliken Instagram (via Apify).
              </p>
            )}
            {enriched && (
              <div className="rise-in space-y-4" data-testid="enrich-result">
                <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2">
                  <p className="min-w-0 text-xs text-muted-foreground">
                    Hittat på <span className="text-foreground">{enriched.pages.map((p) => new URL(p).hostname + new URL(p).pathname.replace(/\/$/, "")).join(" och ")}</span>. Granska och rätta innan du sparar.
                  </p>
                  <ScoreBadge score={enriched.score} className="shrink-0" />
                </div>
                {enriched.notes.map((n) => (
                  <p key={n} className="flex gap-2 text-xs text-warning">
                    <Info className="mt-0.5 size-3.5 shrink-0" /> {n}
                  </p>
                ))}
                {fields}
                <Button className="w-full" onClick={() => create("url")} disabled={busy} data-testid="enrich-save">
                  Spara lead
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="manual" className="space-y-4 pt-2">
            {fields}
            <Button className="w-full" onClick={() => create("manual")} disabled={busy || !form.name.trim()} data-testid="manual-save">
              Spara lead
            </Button>
          </TabsContent>

          <TabsContent value="csv" className="space-y-4 pt-2">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed p-6 text-center transition-colors hover:bg-muted/40">
              <FileUp className="size-5 text-muted-foreground" />
              <span className="text-sm font-medium">{csv ? csv.file : "Välj en CSV-fil"}</span>
              <span className="text-xs text-muted-foreground">Kolumner: Namn, E-post, Telefon, Instagram, Hemsida, Gym, Stad, Segment, Specialisering</span>
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="sr-only"
                data-testid="csv-file"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (file.size > 2_000_000) return toast.error("Filen är för stor (högst 2 MB)")
                  setCsv({ ...leadsFromCsv(await file.text()), file: file.name })
                }}
              />
            </label>
            {csv && (
              <div className="rise-in space-y-3 text-sm" data-testid="csv-summary">
                <p>
                  <span className="font-semibold">{csv.leads.length}</span> leads att importera
                  {csv.columns.length > 0 && <span className="text-muted-foreground"> · kolumner: {csv.columns.join(", ")}</span>}
                </p>
                {csv.skipped.length > 0 && (
                  <ul className="max-h-28 space-y-0.5 overflow-y-auto rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                    {csv.skipped.map((s) => (
                      <li key={s.line}>
                        Rad {s.line}: {s.reason}
                      </li>
                    ))}
                  </ul>
                )}
                <Button className="w-full" onClick={importCsv} disabled={busy || !csv.leads.length} data-testid="csv-import">
                  Importera {csv.leads.length} leads
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="instagram" className="pt-2">
            <InstagramPanel
              enabled={instagramEnabled}
              onAdded={onImported}
              onOpen={(lead) => {
                onDuplicate(lead)
                onOpenChange(false)
              }}
            />
          </TabsContent>

          <TabsContent value="search" className="space-y-4 pt-2">
            {!searchEnabled ? (
              <p className="flex gap-2 rounded-xl bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground" data-testid="search-off">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                Sökningen använder ett officiellt sök-API (Brave Search) i stället för att skrapa sökmotorer, vilket bryter mot deras villkor. Lägg in BRAVE_SEARCH_API_KEY på servern för att slå på den. Tills dess: klistra in adresser under Webbsida.
              </p>
            ) : (
              <>
                <form onSubmit={search} className="grid grid-cols-2 gap-3">
                  <Field label="Segment" className="col-span-2">
                    <Select value={query.segment} onValueChange={(v) => setQuery((q) => ({ ...q, segment: v as Segment }))}>
                      <SelectTrigger className="w-full" aria-label="Segment att söka i">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SEGMENTS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {SEGMENT_LONG[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  {query.segment === "gym_chain" && (
                    <Field label="Gymkedja" className="col-span-2">
                      <Select value={query.gym} onValueChange={(v) => setQuery((q) => ({ ...q, gym: v }))}>
                        <SelectTrigger className="w-full" aria-label="Gymkedja">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {GYM_CHAINS.map((g) => (
                            <SelectItem key={g.name} value={g.name}>
                              {g.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                  <Field label="Stad" htmlFor="sq-city">
                    <Input id="sq-city" value={query.city} onChange={(e) => setQuery((q) => ({ ...q, city: e.target.value }))} list="al-cities" />
                  </Field>
                  <Field label="Specialisering" htmlFor="sq-spec">
                    <Input id="sq-spec" value={query.specialty} onChange={(e) => setQuery((q) => ({ ...q, specialty: e.target.value }))} list="sq-specs" placeholder="valfritt" />
                    <datalist id="sq-specs">
                      {SPECIALTIES.map((s) => (
                        <option key={s.label} value={s.label} />
                      ))}
                    </datalist>
                  </Field>
                  <Button type="submit" className="col-span-2" disabled={busy} data-testid="search-go">
                    <Search /> {busy ? "Söker …" : "Sök prospekts"}
                  </Button>
                </form>
                {candidates && (
                  <ul className="space-y-2" data-testid="search-results">
                    {candidates.length === 0 && <li className="text-sm text-muted-foreground">Inga träffar. Prova en annan stad eller specialisering.</li>}
                    {candidates.map((c) => (
                      <li key={c.url} className="rise-in flex items-start gap-3 rounded-xl border border-border/70 p-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{c.title}</p>
                          <p className="truncate text-xs text-primary">{c.host}</p>
                          <p className="line-clamp-2 text-xs text-muted-foreground">{c.snippet}</p>
                        </div>
                        {c.socialOnly ? (
                          <span className="shrink-0 text-[11px] text-muted-foreground">Hämtas inte automatiskt</span>
                        ) : (
                          <Button size="sm" variant="secondary" className="shrink-0" disabled={busy} onClick={() => enrich(c.url)}>
                            Granska
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
