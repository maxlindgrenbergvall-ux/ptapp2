"use client"

import { CalendarClock, Check, CheckCheck, Pencil, Repeat, ShieldCheck, X } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { ApiError, crm, fmtDateTime } from "@/components/crm/parts"
import { Button } from "@/components/ui/button"
import { confirmDialog } from "@/components/ui/confirm"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { BRAND } from "@/lib/brand"
import { footerText } from "@/lib/crm/templates"
import type { EmailLog, EmailTemplate, Lead } from "@/lib/crm/types"
import { cn } from "@/lib/utils"

/**
 * Granskning av utskick (v55): varje mejl som ska ut visas EXAKT som det
 * skickas – mottagare, ämne, text och sidfoten som läggs till – och måste
 * godkännas av en människa. Även automatiska uppföljningar. Godkända mejl
 * går ut i kön med vanlig takt; avvisade skickas aldrig. Vem som godkände och
 * när sparas på varje utskick.
 */
export function EmailReview({ logs, leads, templates, onChange }: { logs: EmailLog[]; leads: Lead[]; templates: EmailTemplate[]; onChange: (logs: EmailLog[]) => void }) {
  const pending = logs.filter((l) => l.status === "pending_approval").sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
  const [busy, setBusy] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState<{ id: string; subject: string; body: string } | null>(null)

  if (!pending.length) return null

  const approve = async (ids: string[]) => {
    setBusy(ids.length > 1 ? "all" : ids[0])
    try {
      const r = await crm<{ approved: number; logs: EmailLog[] }>("email.approve", { ids })
      onChange(r.logs)
      toast.success(r.approved === 1 ? "Utskicket är godkänt" : `${r.approved} utskick godkända`, { description: "De går ut i kön, ett i taget." })
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Kunde inte godkänna")
    } finally {
      setBusy(null)
    }
  }
  const reject = async (id: string) => {
    setBusy(id)
    try {
      await crm("email.reject", { id })
      onChange(logs.map((l) => (l.id === id ? { ...l, status: "cancelled" as const, error: "Avvisad vid granskning" } : l)))
      toast("Utskicket är avvisat – det skickas inte")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Kunde inte avvisa")
    } finally {
      setBusy(null)
    }
  }
  const saveEdit = async () => {
    if (!editing) return
    setBusy(editing.id)
    try {
      const { log } = await crm<{ log: EmailLog }>("email.edit", editing)
      onChange(logs.map((l) => (l.id === log.id ? log : l)))
      setEditing(null)
      toast.success("Ändringen är sparad – granska och godkänn")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Kunde inte spara")
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-warning/40 bg-warning/[0.04] p-4" aria-labelledby="audit-title" data-testid="email-review">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="audit-title" className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-4 text-warning" aria-hidden /> Att granska innan utskick
            <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-semibold text-warning tabular">{pending.length}</span>
          </h2>
          <p className="text-xs text-muted-foreground">Inget skickas förrän det är godkänt. Läs varje mejl – det som visas är exakt det som går ut.</p>
        </div>
        {pending.length > 1 && (
          <Button
            size="sm"
            variant="outline"
            disabled={Boolean(busy)}
            onClick={async () => {
              if (!(await confirmDialog({ title: `Godkänn alla ${pending.length} utskick?`, description: "Bekräfta att du har läst igenom varje mejl i listan. De går ut i kön med vanlig takt.", confirmLabel: "Jag har läst dem – godkänn" }))) return
              void approve(pending.map((l) => l.id))
            }}
            data-testid="approve-all"
          >
            <CheckCheck /> Godkänn alla {pending.length}
          </Button>
        )}
      </div>
      <ul className="space-y-3" data-testid="review-mails">
        {pending.map((l, i) => {
          const lead = leads.find((x) => x.id === l.leadId)
          const template = templates.find((t) => t.id === l.templateId)
          const footer = footerText({ unsubscribeUrl: "[personlig avregistreringslänk]", sourceUrl: lead?.sourceUrl ?? null, sender: BRAND.name, contactEmail: BRAND.contactEmail, kind: template?.kind })
          const isEditing = editing?.id === l.id
          const due = new Date(l.scheduledAt) <= new Date()
          return (
            <li key={l.id} className="rise-in overflow-hidden rounded-xl border border-border/70 bg-card" style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }} data-testid="review-mail" data-log={l.id}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5 text-xs">
                <span className="min-w-0">
                  <span className="text-muted-foreground">Till:</span> <span className="font-medium">{lead?.name ?? "–"}</span> <span className="text-muted-foreground">&lt;{l.toEmail}&gt;</span>
                </span>
                <span className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  {l.step === 2 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 font-medium" data-testid="review-followup">
                      <Repeat className="size-3" aria-hidden /> Uppföljning
                    </span>
                  )}
                  {template && <span className="truncate">{template.name}</span>}
                  <span className="inline-flex items-center gap-1 tabular">
                    <CalendarClock className="size-3" aria-hidden /> {due ? "går ut direkt efter godkännande" : fmtDateTime(l.scheduledAt)}
                  </span>
                  {l.editedAt && <span className="text-primary">Ändrad</span>}
                </span>
              </div>
              {isEditing ? (
                <div className="space-y-2 p-4">
                  <Input value={editing.subject} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} maxLength={200} aria-label="Ämnesrad" data-testid="edit-subject" />
                  <Textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={10} maxLength={8000} className="text-sm leading-relaxed" aria-label="Text" data-testid="edit-body" />
                </div>
              ) : (
                <div className="space-y-2 p-4 text-sm">
                  <p className="font-semibold" data-testid="review-subject">
                    {l.subject}
                  </p>
                  <p className="whitespace-pre-wrap text-foreground/90" data-testid="review-body">
                    {l.body}
                  </p>
                  <p className="whitespace-pre-wrap border-t border-border/60 pt-2 text-[11px] leading-relaxed text-muted-foreground" data-testid="review-footer">
                    {footer.replace(/^—\n/, "")}
                  </p>
                </div>
              )}
              <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 px-4 py-2.5">
                {isEditing ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Avbryt
                    </Button>
                    <Button size="sm" onClick={() => void saveEdit()} disabled={busy === l.id || !editing.subject.trim() || !editing.body.trim()} data-testid="edit-save">
                      Spara ändringen
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => void reject(l.id)} disabled={Boolean(busy)} data-testid="reject">
                      <X /> Avvisa
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing({ id: l.id, subject: l.subject, body: l.body })} disabled={Boolean(busy)} data-testid="edit">
                      <Pencil /> Redigera
                    </Button>
                    <Button size="sm" onClick={() => void approve([l.id])} disabled={Boolean(busy)} className={cn(busy === l.id && "enrich-sweep")} data-testid="approve">
                      <Check /> Godkänn
                    </Button>
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
