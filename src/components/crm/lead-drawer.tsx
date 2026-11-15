"use client"

import { AtSign, ExternalLink, Globe, Mail, Phone, RefreshCw, ShieldCheck, ShieldQuestion, ShieldX, StickyNote, Trash2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { ApiError, crm, EmailStatusText, Field, fmtDateTime, ScoreBadge, SegmentBadge } from "@/components/crm/parts"
import { Button } from "@/components/ui/button"
import { confirmDialog } from "@/components/ui/confirm"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { normalizeInstagram, normalizeUrl } from "@/lib/crm/csv"
import { CITIES, LEGAL_BASES, LEGAL_LABEL, SEGMENT_LONG, SEGMENTS, SOURCE_LABEL, STATUS_LABEL, STATUSES, type EmailLog, type Lead, type LeadInput, type Note } from "@/lib/crm/types"
import { normalizePhone } from "@/lib/phone"
import { cn } from "@/lib/utils"

type Form = { name: string; title: string; email: string; phone: string; instagram: string; websiteUrl: string; gym: string; city: string; specialties: string }
const formOf = (l: Lead): Form => ({ name: l.name, title: l.title ?? "", email: l.email ?? "", phone: l.phone ?? "", instagram: l.instagram ?? "", websiteUrl: l.websiteUrl ?? "", gym: l.gym ?? "", city: l.city ?? "", specialties: l.specialties.join(", ") })

/** Formuläret → ändringar att spara. Returnerar ett felmeddelande om något fält är ogiltigt. */
export function patchFromForm(f: Form): { patch: LeadInput } | { error: string } {
  if (!f.name.trim()) return { error: "Namn saknas" }
  const email = f.email.trim().toLowerCase()
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "E-postadressen är ogiltig" }
  const phone = f.phone.trim() ? normalizePhone(f.phone.trim().replace(/^(\+46)\s*0/, "$1")) : null
  if (f.phone.trim() && !phone) return { error: "Telefonnumret är ogiltigt (t.ex. 070-123 45 67)" }
  const instagram = f.instagram.trim() ? normalizeInstagram(f.instagram) : null
  if (f.instagram.trim() && !instagram) return { error: "Ange Instagram som kontonamn eller profillänk" }
  const websiteUrl = f.websiteUrl.trim() ? normalizeUrl(f.websiteUrl) : null
  if (f.websiteUrl.trim() && !websiteUrl) return { error: "Webbadressen är ogiltig" }
  return {
    patch: {
      name: f.name.trim(),
      title: f.title.trim() || null,
      email: email || null,
      phone,
      instagram,
      websiteUrl,
      gym: f.gym.trim() || null,
      city: f.city.trim() || null,
      specialties: f.specialties.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12),
    },
  }
}

/**
 * Sidopanelen för en lead: all data, redigering, rättslig grund, anteckningar
 * och utskickshistorik. Ändringar sparas med "Spara"; status, segment och
 * rättslig grund sparas direkt (de är ett val, inte fritext).
 */
export function LeadDrawer({ lead, onClose, onSaved, onDeleted }: { lead: Lead | null; onClose: () => void; onSaved: (lead: Lead) => void; onDeleted: (id: string) => void }) {
  return (
    <Sheet open={Boolean(lead)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg" data-testid="lead-drawer">
        {lead && <Body key={lead.id} lead={lead} onSaved={onSaved} onDeleted={onDeleted} />}
      </SheetContent>
    </Sheet>
  )
}

function Body({ lead, onSaved, onDeleted }: { lead: Lead; onSaved: (lead: Lead) => void; onDeleted: (id: string) => void }) {
  const [form, setForm] = React.useState<Form>(() => formOf(lead))
  const [busy, setBusy] = React.useState(false)
  const [notes, setNotes] = React.useState<Note[] | null>(null)
  const [logs, setLogs] = React.useState<EmailLog[]>([])
  const [note, setNote] = React.useState("")
  const dirty = JSON.stringify(form) !== JSON.stringify(formOf(lead))
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  React.useEffect(() => {
    let alive = true
    crm<{ notes: Note[]; logs: EmailLog[] }>("lead.detail", { id: lead.id })
      .then((d) => {
        if (!alive) return
        setNotes(d.notes)
        setLogs(d.logs)
      })
      .catch(() => alive && setNotes([]))
    return () => {
      alive = false
    }
  }, [lead.id])

  const update = async (patch: LeadInput, message?: string) => {
    setBusy(true)
    try {
      const { lead: saved } = await crm<{ lead: Lead }>("lead.update", { id: lead.id, patch })
      onSaved(saved)
      setForm(formOf(saved))
      if (message) toast.success(message)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Kunde inte spara")
    } finally {
      setBusy(false)
    }
  }
  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const result = patchFromForm(form)
    if ("error" in result) return toast.error(result.error)
    void update(result.patch, "Sparat")
  }
  const addNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!note.trim()) return
    try {
      const { note: saved } = await crm<{ note: Note }>("note.add", { leadId: lead.id, body: note.trim() })
      setNotes((n) => [saved, ...(n ?? [])])
      setNote("")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Kunde inte spara anteckningen")
    }
  }
  const remove = async () => {
    if (!(await confirmDialog({ title: `Radera ${lead.name}?`, description: "Leaden, anteckningarna och utskickshistoriken tas bort. Det går inte att ångra.", confirmLabel: "Radera", destructive: true }))) return
    try {
      await crm("lead.delete", { id: lead.id })
      onDeleted(lead.id)
      toast.success("Leaden är raderad")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Kunde inte radera")
    }
  }

  const Mx = lead.emailVerified === true ? ShieldCheck : lead.emailVerified === false ? ShieldX : ShieldQuestion

  return (
    <div className="flex min-h-full flex-col">
      <div className="space-y-3 border-b border-border/70 p-5 pr-14">
        <div>
          <SheetTitle className="text-xl leading-tight">{lead.name}</SheetTitle>
          <SheetDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <SegmentBadge segment={lead.segment} />
            {lead.title && <span>{lead.title}</span>}
            {(lead.gym || lead.city) && <span>{[lead.gym, lead.city].filter(Boolean).join(" · ")}</span>}
          </SheetDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lead.email && (
            <Button asChild variant="outline" size="sm">
              <a href={`mailto:${lead.email}`}>
                <Mail /> Mejla
              </a>
            </Button>
          )}
          {lead.phone && (
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${lead.phone}`}>
                <Phone /> Ring
              </a>
            </Button>
          )}
          {lead.instagram && (
            <Button asChild variant="outline" size="sm">
              <a href={`https://www.instagram.com/${lead.instagram}/`} target="_blank" rel="noopener noreferrer">
                <AtSign /> Instagram{lead.instagramFollowers !== null && <span className="text-muted-foreground tabular">· {lead.instagramFollowers.toLocaleString("sv-SE")}</span>} <ExternalLink className="size-3 opacity-60" />
              </a>
            </Button>
          )}
          {lead.websiteUrl && (
            <Button asChild variant="outline" size="sm">
              <a href={lead.websiteUrl} target="_blank" rel="noopener noreferrer">
                <Globe /> Webbplats <ExternalLink className="size-3 opacity-60" />
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 border-b border-border/70 p-5">
        <Field label="Status">
          <Select value={lead.status} onValueChange={(v) => void update({ status: v as Lead["status"] })} disabled={busy}>
            <SelectTrigger className="w-full" aria-label="Status" data-testid="drawer-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Segment">
          <Select value={lead.segment} onValueChange={(v) => void update({ segment: v as Lead["segment"] })} disabled={busy}>
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
        <Field
          label="Rättslig grund för utskick"
          className="col-span-2"
          hint="Företagsadress = adressen hör till ett bolag (t.ex. en jobbadress hos en gymkedja eller info@). Enskild firma räknas som privatperson: då krävs samtycke. Utan bedömning går inga mejl ut."
        >
          <Select value={lead.legalBasis} onValueChange={(v) => void update({ legalBasis: v as Lead["legalBasis"] })} disabled={busy}>
            <SelectTrigger className="w-full" aria-label="Rättslig grund för utskick" data-testid="drawer-legal">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEGAL_BASES.map((b) => (
                <SelectItem key={b} value={b}>
                  {LEGAL_LABEL[b]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <section className="space-y-3 border-b border-border/70 p-5" aria-labelledby="score-title">
        <div className="flex items-center justify-between">
          <h3 id="score-title" className="text-sm font-semibold">
            Lead Score
          </h3>
          <ScoreBadge score={lead.score} />
        </div>
        <ul className="space-y-1 text-xs" data-testid="score-breakdown">
          {lead.scoreBreakdown.map((p) => (
            <li key={p.label} className="flex justify-between gap-3 text-muted-foreground">
              <span>{p.label}</span>
              <span className={cn("tabular", p.points < 0 ? "text-destructive" : "text-foreground")}>{p.points > 0 ? `+${p.points}` : p.points}</span>
            </li>
          ))}
          {lead.scoreBreakdown.length === 0 && <li className="text-muted-foreground">Inga uppgifter än – fyll i kontaktuppgifter för att höja poängen.</li>}
        </ul>
      </section>

      <form onSubmit={save} className="space-y-3 border-b border-border/70 p-5" aria-label="Kontaktuppgifter">
        <h3 className="text-sm font-semibold">Kontaktuppgifter</h3>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Namn" htmlFor="ld-name" className="col-span-2">
            <Input id="ld-name" value={form.name} onChange={set("name")} maxLength={160} required />
          </Field>
          <Field label="Titel / roll" htmlFor="ld-title">
            <Input id="ld-title" value={form.title} onChange={set("title")} maxLength={160} />
          </Field>
          <Field label="Gym / företag" htmlFor="ld-gym">
            <Input id="ld-gym" value={form.gym} onChange={set("gym")} maxLength={120} />
          </Field>
          <Field label="E-post" htmlFor="ld-email" className="col-span-2">
            <Input id="ld-email" type="email" value={form.email} onChange={set("email")} maxLength={254} />
            {lead.email && (
              <p className={cn("flex items-center gap-1.5 text-[11px]", lead.emailVerified === true ? "text-primary" : lead.emailVerified === false ? "text-destructive" : "text-muted-foreground")} data-testid="mx-status">
                <Mx className="size-3.5" />
                {lead.emailVerified === true ? "Domänen tar emot e-post (MX)" : lead.emailVerified === false ? "Domänen tar inte emot e-post" : "Domänen är inte kontrollerad"}
              </p>
            )}
          </Field>
          <Field label="Telefon" htmlFor="ld-phone">
            <Input id="ld-phone" type="tel" value={form.phone} onChange={set("phone")} placeholder="+46…" />
          </Field>
          <Field label="Ort" htmlFor="ld-city">
            <Input id="ld-city" value={form.city} onChange={set("city")} list="crm-cities" maxLength={80} />
            <datalist id="crm-cities">
              {CITIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Instagram" htmlFor="ld-ig">
            <Input id="ld-ig" value={form.instagram} onChange={set("instagram")} placeholder="kontonamn" />
          </Field>
          <Field label="Webbplats" htmlFor="ld-web">
            <Input id="ld-web" value={form.websiteUrl} onChange={set("websiteUrl")} placeholder="https://…" />
          </Field>
          <Field label="Specialiseringar" htmlFor="ld-spec" className="col-span-2" hint="Kommaseparerat, t.ex. Styrka, Rehab">
            <Input id="ld-spec" value={form.specialties} onChange={set("specialties")} />
          </Field>
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-[11px] text-muted-foreground">
            Källa: {SOURCE_LABEL[lead.source]}
            {lead.sourceUrl && (
              <>
                {" · "}
                <a href={lead.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                  {new URL(lead.sourceUrl).hostname}
                </a>
              </>
            )}
          </p>
          <Button type="submit" size="sm" disabled={!dirty || busy} data-testid="drawer-save">
            {busy ? <RefreshCw className="animate-spin" /> : null} Spara
          </Button>
        </div>
      </form>

      <section className="space-y-3 border-b border-border/70 p-5" aria-labelledby="notes-title">
        <h3 id="notes-title" className="flex items-center gap-2 text-sm font-semibold">
          <StickyNote className="size-4" /> Interna anteckningar
        </h3>
        <form onSubmit={addNote} className="space-y-2">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="T.ex. Ringde – vill se en demo efter jul" rows={2} maxLength={4000} aria-label="Ny anteckning" />
          <div className="flex justify-end">
            <Button type="submit" size="sm" variant="secondary" disabled={!note.trim()} data-testid="note-add">
              Lägg till
            </Button>
          </div>
        </form>
        <ul className="space-y-2" data-testid="notes">
          {notes === null && <li className="h-12 rounded-xl skeleton" />}
          {notes?.map((n) => (
            <li key={n.id} className="rise-in rounded-xl bg-muted/50 px-3 py-2 text-sm">
              <p className="whitespace-pre-wrap">{n.body}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{fmtDateTime(n.createdAt)}</p>
            </li>
          ))}
          {notes?.length === 0 && <li className="text-xs text-muted-foreground">Inga anteckningar än.</li>}
        </ul>
      </section>

      <section className="space-y-3 border-b border-border/70 p-5" aria-labelledby="mail-title">
        <h3 id="mail-title" className="flex items-center gap-2 text-sm font-semibold">
          <Mail className="size-4" /> Utskick
        </h3>
        {lead.unsubscribedAt && <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">Har avböjt kontakt ({fmtDateTime(lead.unsubscribedAt)}). Inga fler mejl skickas.</p>}
        <ul className="space-y-1.5 text-sm">
          {logs.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate">{l.subject}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-[11px] text-muted-foreground tabular">{fmtDateTime(l.deliveredAt ?? l.sentAt ?? l.scheduledAt)}</span>
                <EmailStatusText status={l.status} />
              </span>
            </li>
          ))}
          {logs.length === 0 && <li className="text-xs text-muted-foreground">Inga mejl än.</li>}
        </ul>
      </section>

      <div className="mt-auto flex justify-between gap-2 p-5">
        <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={remove} data-testid="drawer-delete">
          <Trash2 /> Radera lead
        </Button>
        {lead.email && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={async () => {
            setBusy(true)
            try {
              const { leads } = await crm<{ leads: Lead[] }>("lead.verify", { ids: [lead.id] })
              if (leads[0]) onSaved(leads[0])
              toast.success("E-postdomänen är kontrollerad")
            } catch (e) {
              toast.error(e instanceof ApiError ? e.message : "Kunde inte kontrollera")
            } finally {
              setBusy(false)
            }
          }}>
            <ShieldCheck /> Kontrollera e-post
          </Button>
        )}
      </div>
    </div>
  )
}
