"use client"

import { AtSign, BellRing, CalendarCheck, CalendarClock, Check, CheckCheck, Copy, ExternalLink, Flame, MessageCircle, PhoneCall, PhoneOff, Reply, ShieldAlert, UserPlus, X, type LucideIcon } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { ApiError, crm, Field, fmtDateTime } from "@/components/crm/parts"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { recommendation } from "@/lib/crm/compliance"
import { nextAction } from "@/lib/crm/next-action"
import { dmText } from "@/lib/crm/templates"
import { ACTIVITY_LABEL, COMPANY_FORM_LABEL, COMPANY_FORMS, type Activity, type ActivityKind, type CompanyForm, type EmailLog, type Lead, type LeadInput } from "@/lib/crm/types"
import { cn } from "@/lib/utils"

/** "2026-11-20T10:00" (datetime-local, svensk tid i webbläsaren) → ISO. */
const localToIso = (v: string) => (v ? new Date(v).toISOString() : null)
/** Nästa vardag kl. 10 (förval för samtal och påminnelser). */
function nextWeekday10(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`
}

/** Överst i panelen: nästa steg för leaden, med skäl. */
export function NextActionBanner({ lead, logs, activities }: { lead: Lead; logs: EmailLog[]; activities: Activity[] }) {
  const [now] = React.useState(() => new Date())
  const a = nextAction(lead, { logs, activities, now })
  if (a.kind === "none") return null
  return (
    <div className={cn("rise-in flex items-center gap-3 rounded-xl border px-3 py-2.5", a.due ? "border-primary/40 bg-primary/10" : "border-border/70 bg-muted/40")} data-testid="next-action" data-action={a.kind}>
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", a.due ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
        {a.hot ? <Flame className="size-4" aria-hidden /> : <CalendarClock className="size-4" aria-hidden />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">Nästa steg: {a.label}</span>
        <span className="block truncate text-xs text-muted-foreground">{a.reason}</span>
      </span>
    </div>
  )
}

/** Bolagsform + organisationsnummer + vad det innebär för utskicken. */
export function CompanyFormSection({ lead, busy, onUpdate }: { lead: Lead; busy: boolean; onUpdate: (patch: LeadInput, message?: string) => Promise<void> }) {
  const [org, setOrg] = React.useState(lead.orgNumber ?? "")
  const enskildCompanyBasis = lead.companyForm === "enskild" && lead.legalBasis === "company"
  return (
    <div className="col-span-2 space-y-2" data-testid="company-form">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bolagsform">
          <Select value={lead.companyForm} onValueChange={(v) => void onUpdate({ companyForm: v as CompanyForm }, v === "enskild" ? "Enskild firma – referensgruppsmallen förvald" : v === "ab" ? "Aktiebolag – B2B-mallen förvald" : undefined)} disabled={busy}>
            <SelectTrigger className="w-full" aria-label="Bolagsform" data-testid="drawer-company-form">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMPANY_FORMS.map((f) => (
                <SelectItem key={f} value={f}>
                  {COMPANY_FORM_LABEL[f]}
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
          <p className="self-end pb-2 text-[11px] leading-snug text-muted-foreground">{lead.companyForm === "enskild" ? "Personnummer sparas aldrig." : "AB eller enskild firma?"}</p>
        )}
      </div>
      <p className={cn("flex gap-2 rounded-xl px-3 py-2 text-xs leading-relaxed", enskildCompanyBasis ? "bg-destructive/10 text-destructive" : "bg-primary/[0.07] text-foreground/90")} data-testid="recommendation">
        <ShieldAlert className={cn("mt-0.5 size-3.5 shrink-0", enskildCompanyBasis ? "text-destructive" : "text-primary")} aria-hidden />
        {enskildCompanyBasis ? "Enskild firma räknas som privatperson – grunden Företagsadress gäller inte. Byt till Icke-säljande förfrågan eller Samtycke." : recommendation(lead)}
      </p>
    </div>
  )
}

const QUICK: { kind: ActivityKind; icon: LucideIcon; label: string }[] = [
  { kind: "dm_sent", icon: AtSign, label: "DM skickat" },
  { kind: "dm_reply", icon: MessageCircle, label: "Svar på DM" },
  { kind: "email_reply", icon: Reply, label: "Svar på mejl" },
  { kind: "call_held", icon: CheckCheck, label: "Samtal klart" },
  { kind: "no_show", icon: PhoneOff, label: "Uteblev" },
  { kind: "converted", icon: UserPlus, label: "Blev PT" },
]

/**
 * Snabbloggning (v53): ett klick per händelse. Svar och bokningar pausar
 * automatiskt alla köade mejl till leaden (även uppföljningen). "Boka samtal"
 * och "Påminn mig" frågar bara efter en tid.
 */
export function QuickLog({ lead, onLogged, onUpdate, busy }: { lead: Lead; onLogged: (a: Activity, lead: Lead, cancelled: number) => void; onUpdate: (patch: LeadInput, message?: string) => Promise<void>; busy: boolean }) {
  const [pending, setPending] = React.useState<ActivityKind | null>(null)
  const [form, setForm] = React.useState<null | "book" | "remind">(null)
  const [when, setWhen] = React.useState(nextWeekday10)
  const [note, setNote] = React.useState("")

  const log = async (kind: ActivityKind, extra: { meetingAt?: string | null; body?: string | null } = {}) => {
    setPending(kind)
    try {
      const r = await crm<{ activity: Activity; lead: Lead; cancelled: number }>("activity.log", { leadId: lead.id, kind, ...extra })
      onLogged(r.activity, r.lead, r.cancelled)
      navigator.vibrate?.(8)
      toast.success(ACTIVITY_LABEL[kind], { description: r.cancelled ? `${r.cancelled} köade mejl pausades` : kind === "converted" ? "Välkommen in i Coavira" : undefined })
      setForm(null)
      setNote("")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Kunde inte logga")
    } finally {
      setPending(null)
    }
  }

  return (
    <section className="space-y-3 border-b border-border/70 p-5" aria-labelledby="quick-title" data-testid="quick-log">
      <h3 id="quick-title" className="text-sm font-semibold">
        Logga
      </h3>
      <div className="grid grid-cols-3 gap-1.5">
        {QUICK.map(({ kind, icon: Icon, label }) => (
          <button
            key={kind}
            type="button"
            disabled={pending !== null || busy}
            onClick={() => void log(kind)}
            className={cn(
              "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl border border-border/70 px-1 py-1.5 text-[11px] font-medium transition-[border-color,background-color,transform] duration-200 hover:border-primary/50 hover:bg-primary/[0.06] active:scale-95 disabled:opacity-50",
              kind === "converted" && "border-primary/40 text-primary"
            )}
            data-testid={`log-${kind}`}
          >
            {pending === kind ? <Check className="size-4 animate-pulse" aria-hidden /> : <Icon className="size-4" aria-hidden />}
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Button variant={form === "book" ? "default" : "outline"} size="sm" onClick={() => setForm(form === "book" ? null : "book")} data-testid="open-book">
          <PhoneCall /> Boka samtal
        </Button>
        <Button variant={form === "remind" ? "default" : "outline"} size="sm" onClick={() => setForm(form === "remind" ? null : "remind")} data-testid="open-remind">
          <BellRing /> Påminn mig
        </Button>
      </div>
      {form && (
        <form
          className="rise-in space-y-2 rounded-xl border border-border/70 bg-muted/30 p-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (form === "book") void log("call_booked", { meetingAt: localToIso(when), body: note.trim() || null })
            else void onUpdate({ nextActionAt: localToIso(when), nextActionNote: note.trim() || null }, "Påminnelsen är sparad").then(() => setForm(null))
          }}
          data-testid={form === "book" ? "book-form" : "remind-form"}
        >
          <div className="grid grid-cols-[auto_1fr] items-center gap-2">
            <label htmlFor="ql-when" className="text-xs text-muted-foreground">
              {form === "book" ? "Tid" : "När"}
            </label>
            <Input id="ql-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} required className="h-9" />
            <label htmlFor="ql-note" className="text-xs text-muted-foreground">
              {form === "book" ? "Notering" : "Vad"}
            </label>
            <Input id="ql-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={form === "book" ? 2000 : 200} placeholder={form === "book" ? "T.ex. Google Meet, 10 min" : "T.ex. Ring om referensgruppen"} className="h-9" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setForm(null)}>
              Avbryt
            </Button>
            <Button type="submit" size="sm" disabled={pending !== null || busy} data-testid={form === "book" ? "book-save" : "remind-save"}>
              {form === "book" ? <CalendarCheck /> : <BellRing />} Spara
            </Button>
          </div>
        </form>
      )}
      {lead.meetingAt && lead.status === "meeting" && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="meeting-at">
          <CalendarCheck className="size-3.5 text-primary" aria-hidden /> Samtal {fmtDateTime(lead.meetingAt)}
        </p>
      )}
      {lead.nextActionAt && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="reminder">
          <BellRing className="size-3.5 text-primary" aria-hidden /> {lead.nextActionNote || "Påminnelse"} · {fmtDateTime(lead.nextActionAt)}
          <button type="button" className="ml-auto rounded p-0.5 hover:bg-muted" aria-label="Ta bort påminnelsen" onClick={() => void onUpdate({ nextActionAt: null, nextActionNote: null })}>
            <X className="size-3.5" />
          </button>
        </p>
      )}
    </section>
  )
}

/**
 * Instagram-DM (v53): referensgruppstexten i DM-form att kopiera, och en
 * länk till profilen. Instagram tillåter inte automatiska DM – det skickas
 * för hand och loggas med "DM skickat".
 */
export function DmHelper({ lead, sender }: { lead: Lead; sender: string | null }) {
  const [copied, setCopied] = React.useState(false)
  if (!lead.instagram) return null
  const text = dmText(lead, sender)
  return (
    <section className="space-y-2 border-b border-border/70 p-5" aria-labelledby="dm-title" data-testid="dm-helper">
      <h3 id="dm-title" className="flex items-center gap-2 text-sm font-semibold">
        <AtSign className="size-4" /> Instagram-DM
      </h3>
      <p className="rounded-xl bg-muted/50 px-3 py-2 text-sm whitespace-pre-wrap" data-testid="dm-text">
        {text}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text)
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1600)
            } catch {
              toast.error("Kunde inte kopiera – markera texten och kopiera för hand")
            }
          }}
          data-testid="dm-copy"
        >
          {copied ? <Check className="text-primary" /> : <Copy />} {copied ? "Kopierat" : "Kopiera"}
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href={`https://ig.me/m/${lead.instagram}`} target="_blank" rel="noopener noreferrer">
            Öppna DM <ExternalLink className="size-3 opacity-60" />
          </a>
        </Button>
      </div>
    </section>
  )
}

const KIND_ICON: Record<ActivityKind, LucideIcon> = { dm_sent: AtSign, dm_reply: MessageCircle, email_reply: Reply, call_booked: PhoneCall, call_held: CheckCheck, no_show: PhoneOff, converted: UserPlus }

/** Aktiviteter i tidsordning (nyast först). */
export function ActivityList({ activities }: { activities: Activity[] }) {
  if (!activities.length) return null
  return (
    <ul className="space-y-1.5" data-testid="activities">
      {activities.map((a) => {
        const Icon = KIND_ICON[a.kind]
        return (
          <li key={a.id} className="rise-in flex items-start gap-2.5 text-sm">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
              <Icon className="size-3.5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-medium">{ACTIVITY_LABEL[a.kind]}</span>
              {a.body && <span className="text-muted-foreground"> · {a.body}</span>}
              <span className="block text-[11px] text-muted-foreground tabular">{fmtDateTime(a.occurredAt)}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
