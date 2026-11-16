"use client"

import { CalendarClock, ChevronDown, CircleAlert, FilePen, Repeat, Send, ShieldCheck } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { ApiError, crm, Field, fmtDateTime } from "@/components/crm/parts"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { QueueConfig } from "@/lib/crm/outreach"
import { salesIssues } from "@/lib/crm/compliance"
import { VARIABLES } from "@/lib/crm/templates"
import { COMPANY_FORM_LABEL, SEGMENT_LABEL, SEGMENTS, TEMPLATE_KIND_LABEL, type CompanyForm, type EmailLog, type EmailTemplate, type Segment, type TemplateKind } from "@/lib/crm/types"
import { cn } from "@/lib/utils"

interface PreviewItem {
  leadId: string
  name: string
  email: string | null
  templateName: string | null
  templateKind: TemplateKind | null
  followupDays: number | null
  subject: string
  body: string
  blockers: { code: string; text: string }[]
  scheduledAt: string | null
}
const AUTO = "auto"

/**
 * Förhandsgranska & schemalägg: visar exakt vilka mejl som skulle gå ut, till
 * vem och när – och vilka som hoppas över och varför. Servern räknar om allt
 * när utskicket köas, så det som visas är det som händer.
 */
export function OutreachDialog({ open, onOpenChange, leadIds, templates, onScheduled }: { open: boolean; onOpenChange: (o: boolean) => void; leadIds: string[]; templates: EmailTemplate[]; onScheduled: (logs: EmailLog[]) => void }) {
  const [templateId, setTemplateId] = React.useState(AUTO)
  const [items, setItems] = React.useState<PreviewItem[] | null>(null)
  const [queue, setQueue] = React.useState<QueueConfig | null>(null)
  const [sender, setSender] = React.useState(true)
  const [expanded, setExpanded] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!open || !leadIds.length) return
    let alive = true
    crm<{ items: PreviewItem[]; queue: QueueConfig; sender: boolean }>("outreach.preview", { leadIds, templateId: templateId === AUTO ? null : templateId })
      .then((r) => {
        if (!alive) return
        setItems(r.items)
        setQueue(r.queue)
        setSender(r.sender)
        setExpanded((e) => e ?? r.items.find((i) => !i.blockers.length)?.leadId ?? null)
      })
      .catch((e) => alive && toast.error(e instanceof ApiError ? e.message : "Kunde inte förhandsgranska"))
    return () => {
      alive = false
    }
  }, [open, leadIds, templateId])

  const ok = items?.filter((i) => !i.blockers.length) ?? []
  const skipped = items?.filter((i) => i.blockers.length) ?? []

  const schedule = async () => {
    setBusy(true)
    try {
      const r = await crm<{ logs: EmailLog[]; skipped: number }>("outreach.schedule", { leadIds, templateId: templateId === AUTO ? null : templateId })
      onScheduled(r.logs)
      toast.success(`${r.logs.length} mejl väntar på granskning`, { description: `Läs och godkänn dem under Utskick – inget skickas innan.${r.skipped ? ` ${r.skipped} hoppades över.` : ""}` })
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Kunde inte schemalägga")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setItems(null)
          setExpanded(null)
        }
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl" data-testid="outreach">
        <DialogHeader>
          <DialogTitle>Förbered utskick</DialogTitle>
          <DialogDescription>
            {queue
              ? `Mejlen hamnar under Utskick för granskning. När de är godkända går de ut ett i taget med minst ${queue.minGapSeconds} sekunder emellan, högst ${queue.dailyCap} per dygn, vardagar kl. ${queue.windowStartHour}–${queue.windowEndHour}.`
              : "Räknar ut vilka som kan få ett mejl …"}
          </DialogDescription>
        </DialogHeader>

        <Field label="Mall">
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger className="w-full" aria-label="Mall" data-testid="outreach-template">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUTO}>Automatiskt – rätt mall för varje leads bolagsform och segment</SelectItem>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {!sender && (
          <p className="flex gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs leading-relaxed text-warning" data-testid="sender-off">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
            Avsändaren är inte konfigurerad (RESEND_API_KEY och CRM_FROM_EMAIL på servern). Du kan schemalägga, men inget skickas förrän det är på plats.
          </p>
        )}

        {items === null ? (
          <div className="space-y-2">
            <div className="h-14 rounded-xl skeleton" />
            <div className="h-14 rounded-xl skeleton" />
          </div>
        ) : (
          <div className="space-y-4">
            <ul className="space-y-2" aria-label="Mejl som skickas" data-testid="outreach-ok">
              {ok.map((i) => (
                <li key={i.leadId} className="overflow-hidden rounded-xl border border-border/70">
                  <button type="button" onClick={() => setExpanded(expanded === i.leadId ? null : i.leadId)} aria-expanded={expanded === i.leadId} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{i.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {i.email} · {i.templateName}
                      </span>
                      <span className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                        {i.templateKind === "research" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 font-medium text-primary" data-testid="research-tag">
                            <ShieldCheck className="size-3" aria-hidden /> Icke-säljande
                          </span>
                        )}
                        {i.followupDays ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5" data-testid="followup-tag">
                            <Repeat className="size-3" aria-hidden /> Uppföljning efter {i.followupDays} dagar om inget svar
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground tabular">
                      <CalendarClock className="size-3.5" /> {i.scheduledAt ? fmtDateTime(i.scheduledAt) : "–"}
                    </span>
                    <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", expanded === i.leadId && "rotate-180")} />
                  </button>
                  {expanded === i.leadId && (
                    <div className="rise-in space-y-2 border-t border-border/70 bg-muted/30 p-3 text-sm" data-testid="outreach-mail">
                      <p className="font-semibold">{i.subject}</p>
                      <p className="whitespace-pre-wrap text-muted-foreground">{i.body}</p>
                      <p className="border-t border-border/70 pt-2 text-[11px] text-muted-foreground">+ sidfot som alltid läggs till: avsändare, var uppgifterna kommer ifrån och en avregistreringslänk.</p>
                    </div>
                  )}
                </li>
              ))}
              {ok.length === 0 && <li className="rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">Ingen av de valda kan få ett mejl just nu.</li>}
            </ul>
            {skipped.length > 0 && (
              <div className="space-y-1.5" data-testid="outreach-skipped">
                <p className="text-xs font-medium text-muted-foreground">Hoppas över ({skipped.length})</p>
                <ul className="space-y-1 text-xs">
                  {skipped.map((i) => (
                    <li key={i.leadId} className="flex gap-2">
                      <span className="w-36 shrink-0 truncate font-medium">{i.name}</span>
                      <span className="text-muted-foreground">{i.blockers.map((b) => b.text).join(" · ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={schedule} disabled={busy || !ok.length} data-testid="outreach-schedule">
            <Send /> Skicka {ok.length || ""} till granskning
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Redigera mallarna: en per segment (eller för alla), med variabler som fylls i per lead. */
export function TemplatesDialog({ open, onOpenChange, templates, onChange }: { open: boolean; onOpenChange: (o: boolean) => void; templates: EmailTemplate[]; onChange: (templates: EmailTemplate[]) => void }) {
  const [id, setId] = React.useState<string | null>(null)
  const current = templates.find((t) => t.id === id) ?? templates[0]
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const value: Draft = draft ?? (current ? toDraft(current) : EMPTY)
  const issues = value.kind === "research" ? [...new Set(salesIssues(`${value.subject}\n${value.body}\n${value.followupBody ?? ""}`))] : []
  const bodyRef = React.useRef<HTMLTextAreaElement>(null)
  const [busy, setBusy] = React.useState(false)
  const edit = (patch: Partial<typeof value>) => setDraft({ ...value, ...patch })

  const insert = (key: string) => {
    const el = bodyRef.current
    const token = `{{${key}}}`
    const at = el ? el.selectionStart : value.body.length
    edit({ body: value.body.slice(0, at) + token + value.body.slice(el ? el.selectionEnd : at) })
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(at + token.length, at + token.length)
    })
  }
  const save = async () => {
    setBusy(true)
    try {
      const { template } = await crm<{ template: EmailTemplate }>("template.save", {
        template: {
          id: value.id,
          segment: value.segment,
          kind: value.kind,
          companyForm: value.companyForm,
          name: value.name,
          subject: value.subject,
          body: value.body,
          followupDays: value.followupBody?.trim() ? value.followupDays : null,
          followupSubject: value.followupBody?.trim() ? value.followupSubject || null : null,
          followupBody: value.followupBody?.trim() || null,
        },
      })
      onChange(templates.some((t) => t.id === template.id) ? templates.map((t) => (t.id === template.id ? template : t)) : [...templates, template])
      setId(template.id)
      setDraft(null)
      toast.success("Mallen är sparad")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Kunde inte spara mallen")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setDraft(null)
        onOpenChange(o)
      }}
    >
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl" data-testid="templates">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilePen className="size-4" /> E-postmallar
          </DialogTitle>
          <DialogDescription>En mall per segment. Variablerna fylls i för varje lead, och sidfoten med avregistreringslänk läggs alltid till automatiskt.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Mallar">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={!draft?.id ? t.id === current?.id && draft === null : draft.id === t.id}
              onClick={() => {
                setId(t.id)
                setDraft(null)
              }}
              className={cn("rounded-full border px-3 py-1.5 text-xs font-medium transition-colors", t.id === value.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}
            >
              {t.name}
            </button>
          ))}
          <button type="button" onClick={() => setDraft(EMPTY)} className="rounded-full border border-dashed px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
            + Ny mall
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Namn" htmlFor="tp-name">
            <Input id="tp-name" value={value.name} onChange={(e) => edit({ name: e.target.value })} maxLength={120} />
          </Field>
          <Field label="Segment">
            <Select value={value.segment ?? "all"} onValueChange={(v) => edit({ segment: v === "all" ? null : (v as Segment) })}>
              <SelectTrigger className="w-full" aria-label="Mallens segment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla segment</SelectItem>
                {SEGMENTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SEGMENT_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Typ" hint={value.kind === "research" ? "Får gå till enskilda firmor utan samtycke – inget pris, erbjudande, länk eller uppmaning att registrera sig." : undefined}>
            <Select value={value.kind} onValueChange={(v) => edit({ kind: v as TemplateKind, ...(v === "research" ? { followupDays: null, followupBody: null, followupSubject: null } : {}) })}>
              <SelectTrigger className="w-full" aria-label="Malltyp" data-testid="template-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["intro", "research"] as const).map((k) => (
                  <SelectItem key={k} value={k}>
                    {TEMPLATE_KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Bolagsform">
            <Select value={value.companyForm ?? "all"} onValueChange={(v) => edit({ companyForm: v === "all" ? null : (v as CompanyForm) })}>
              <SelectTrigger className="w-full" aria-label="Mallens bolagsform">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla bolagsformer</SelectItem>
                <SelectItem value="ab">{COMPANY_FORM_LABEL.ab}</SelectItem>
                <SelectItem value="enskild">{COMPANY_FORM_LABEL.enskild}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Ämnesrad" htmlFor="tp-subject" className="col-span-2">
            <Input id="tp-subject" value={value.subject} onChange={(e) => edit({ subject: e.target.value })} maxLength={200} data-testid="template-subject" />
          </Field>
          <Field label="Text" htmlFor="tp-body" className="col-span-2">
            <Textarea id="tp-body" ref={bodyRef} value={value.body} onChange={(e) => edit({ body: e.target.value })} rows={12} maxLength={8000} className="font-mono text-[13px] leading-relaxed" data-testid="template-body" />
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-muted-foreground">Infoga:</span>
              {VARIABLES.map((v) => (
                <button key={v.key} type="button" onClick={() => insert(v.key)} title={`T.ex. ${v.hint}`} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] transition-colors hover:bg-primary/15 hover:text-primary">
                  {`{{${v.key}}}`}
                </button>
              ))}
            </div>
          </Field>
          {issues.length > 0 && (
            <p className="col-span-2 flex gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive" data-testid="sales-warning">
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Mallen ska vara icke-säljande men innehåller {issues.join(", ")}. Den skickas inte till enskilda firmor förrän det är borttaget.
            </p>
          )}
          {value.kind === "intro" ? (
            <div className="col-span-2 space-y-3 rounded-xl border border-border/70 p-3" data-testid="followup-editor">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={value.followupDays !== null}
                  onChange={(e) => edit(e.target.checked ? { followupDays: 4, followupSubject: value.followupSubject ?? value.subject, followupBody: value.followupBody ?? "" } : { followupDays: null, followupBody: null, followupSubject: null })}
                  data-testid="followup-toggle"
                />
                <Repeat className="size-4 text-muted-foreground" aria-hidden /> Automatisk uppföljning om inget svar
              </label>
              {value.followupDays !== null && (
                <div className="grid grid-cols-[6rem_1fr] gap-3">
                  <Field label="Efter dagar" htmlFor="tp-fu-days">
                    <Input id="tp-fu-days" type="number" min={2} max={14} value={value.followupDays} onChange={(e) => edit({ followupDays: Math.min(14, Math.max(2, Number(e.target.value) || 4)) })} data-testid="followup-days" />
                  </Field>
                  <Field label="Ämnesrad" htmlFor="tp-fu-subject">
                    <Input id="tp-fu-subject" value={value.followupSubject ?? ""} onChange={(e) => edit({ followupSubject: e.target.value })} maxLength={200} />
                  </Field>
                  <Field label="Text" htmlFor="tp-fu-body" className="col-span-2" hint="Pausas automatiskt så fort leaden svarar, bokar samtal eller avregistrerar sig. Skickas aldrig till enskilda firmor utan samtycke.">
                    <Textarea id="tp-fu-body" value={value.followupBody ?? ""} onChange={(e) => edit({ followupBody: e.target.value })} rows={5} maxLength={4000} className="font-mono text-[13px] leading-relaxed" data-testid="followup-body" />
                  </Field>
                </div>
              )}
            </div>
          ) : (
            <p className="col-span-2 text-xs text-muted-foreground">Icke-säljande mallar får ingen automatisk uppföljning – följ hellre upp med ett Instagram-DM.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Stäng
          </Button>
          <Button onClick={save} disabled={busy || !draft || !value.name.trim() || !value.subject.trim() || !value.body.trim() || (value.followupDays !== null && !value.followupBody?.trim())} data-testid="template-save">
            Spara mall
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type Draft = Omit<EmailTemplate, "id" | "key" | "updatedAt"> & { id?: string }
const EMPTY: Draft = { segment: null, kind: "intro", companyForm: null, name: "", subject: "", body: "", followupDays: null, followupSubject: null, followupBody: null }
const toDraft = (t: EmailTemplate): Draft => ({ id: t.id, segment: t.segment, kind: t.kind, companyForm: t.companyForm, name: t.name, subject: t.subject, body: t.body, followupDays: t.followupDays, followupSubject: t.followupSubject, followupBody: t.followupBody })
