"use client"

/**
 * Moderering (v65) – /admin/moderering. Rapporter från chatten granskas manuellt:
 * varna, stäng av (7 dagar, 30 dagar eller tills vidare), häv eller avfärda.
 * Varje åtgärd kräver ett skäl (minst 10 tecken) som användaren ser i appen.
 * Allt går via adminfunktionerna i databasen (is_admin kontrolleras där).
 */
import { Ban, CheckCircle2, Flag, ShieldAlert, ShieldCheck, TriangleAlert, XCircle } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { REPORT_CATEGORIES } from "@/lib/account-status"
import { getSupabase } from "@/lib/supabase/client"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import { cn } from "@/lib/utils"

interface ReportRow {
  id: string
  created_at: string
  category: string
  details: string | null
  status: "open" | "actioned" | "dismissed"
  reporter_name: string | null
  reported_user_id: string
  reported_name: string | null
  reported_role: "client" | "trainer" | null
  reported_suspended: boolean
  reported_actions: number
  message_body: string | null
  message_attachments: { name?: string; kind?: string }[] | null
  message_sent_at: string | null
}

const CATEGORY = Object.fromEntries(REPORT_CATEGORIES.map((c) => [c.value, c.label])) as Record<string, string>
const when = (iso: string) => new Date(iso).toLocaleString("sv-SE", { dateStyle: "medium", timeStyle: "short" })

export function ModerationDashboard() {
  const [filter, setFilter] = React.useState<"open" | "all">("open")
  const [rows, setRows] = React.useState<ReportRow[] | null>(isSupabaseEnabled ? null : [])
  const [error, setError] = React.useState<string | null>(null)

  // Ökar efter varje åtgärd så att listan hämtas igen.
  const [version, setVersion] = React.useState(0)
  React.useEffect(() => {
    if (!isSupabaseEnabled) return
    let cancelled = false
    void getSupabase()
      .rpc("admin_list_reports", { p_status: filter })
      .then(({ data, error: e }) => {
        if (cancelled) return
        setError(e ? e.message : null)
        if (!e) setRows((data as ReportRow[]) ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [filter, version])
  const load = () => setVersion((v) => v + 1)

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Flag className="size-5 text-primary" /> Moderering
          </h1>
          <p className="text-sm text-muted-foreground">Rapporter från chatten. Varje åtgärd kräver ett skäl som användaren ser.</p>
        </div>
        <div className="flex rounded-xl bg-muted p-1 text-sm" role="tablist">
          {(["open", "all"] as const).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={cn("rounded-lg px-3 py-1.5", filter === f && "bg-background font-medium shadow-xs")}>
              {f === "open" ? "Öppna" : "Alla"}
            </button>
          ))}
        </div>
      </div>
      {!isSupabaseEnabled && <p className="rounded-xl border p-4 text-sm text-muted-foreground">Demoläge – rapporter finns bara med Supabase.</p>}
      {error && <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">{error}</p>}
      {rows?.length === 0 && isSupabaseEnabled && <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">Inga {filter === "open" ? "öppna " : ""}rapporter.</p>}
      {rows?.map((r) => <ReportCard key={r.id} report={r} onChanged={load} />)}
    </div>
  )
}

function ReportCard({ report: r, onChanged }: { report: ReportRow; onChanged: () => void }) {
  const [reason, setReason] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const reasonOk = reason.trim().length >= 10

  const run = async (label: string, fn: () => PromiseLike<{ error: { message: string } | null }>, resolve?: "actioned" | "dismissed") => {
    setBusy(true)
    try {
      const { error } = await fn()
      if (error) throw new Error(error.message)
      if (resolve) {
        const res = await getSupabase().rpc("admin_resolve_report", { p_report: r.id, p_status: resolve })
        if (res.error) throw new Error(res.error.message)
      }
      toast.success(label)
      setReason("")
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Åtgärden misslyckades")
    } finally {
      setBusy(false)
    }
  }
  const sb = () => getSupabase()
  const suspend = (days: number | null) =>
    run(
      days ? `Avstängd i ${days} dagar` : "Avstängd tills vidare",
      () => sb().rpc("admin_suspend_account", { p_user: r.reported_user_id, p_reason: reason.trim(), p_until: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null, p_report: r.id }),
      "actioned"
    )

  return (
    <article className="space-y-3 rounded-2xl border bg-card p-4" data-testid="report-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{CATEGORY[r.category] ?? r.category}</p>
          <p className="text-xs text-muted-foreground">
            {when(r.created_at)} · rapporterad av {r.reporter_name ?? "okänd"}
          </p>
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", r.status === "open" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground")}>
          {r.status === "open" ? "Öppen" : r.status === "actioned" ? "Åtgärdad" : "Avfärdad"}
        </span>
      </div>
      <div className="rounded-xl bg-muted/60 p-3 text-sm">
        <p className="mb-1 text-xs text-muted-foreground">
          {r.reported_name ?? "Okänd"} ({r.reported_role === "trainer" ? "PT" : "klient"}){r.message_sent_at ? ` · ${when(r.message_sent_at)}` : ""}
          {r.reported_actions > 0 && ` · ${r.reported_actions} tidigare åtgärd(er)`}
          {r.reported_suspended && <span className="ml-1 font-medium text-destructive">· avstängd nu</span>}
        </p>
        {r.message_body ? <p className="whitespace-pre-wrap break-words">{r.message_body}</p> : <p className="text-muted-foreground italic">Meddelandet saknas eller har raderats.</p>}
        {!!r.message_attachments?.length && (
          <p className="mt-1 text-xs text-muted-foreground">Bilagor: {r.message_attachments.map((a) => `${a.name ?? "fil"} (${a.kind ?? "fil"})`).join(", ")}</p>
        )}
      </div>
      {r.details && (
        <p className="text-sm">
          <span className="text-muted-foreground">Rapportörens beskrivning:</span> {r.details}
        </p>
      )}
      {r.status === "open" && (
        <>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} placeholder="Skäl som användaren ser (minst 10 tecken), t.ex. vilken regel som bröts." aria-label="Skäl" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy || !reasonOk} onClick={() => run("Varning skickad", () => sb().rpc("admin_warn_account", { p_user: r.reported_user_id, p_reason: reason.trim(), p_report: r.id }), "actioned")}>
              <TriangleAlert /> Varna
            </Button>
            <Button size="sm" variant="outline" disabled={busy || !reasonOk} onClick={() => suspend(7)}>
              <ShieldAlert /> Stäng av 7 dagar
            </Button>
            <Button size="sm" variant="outline" disabled={busy || !reasonOk} onClick={() => suspend(30)}>
              <ShieldAlert /> 30 dagar
            </Button>
            <Button size="sm" variant="destructive" disabled={busy || !reasonOk} onClick={() => suspend(null)}>
              <Ban /> Tills vidare
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run("Rapporten avfärdad", () => sb().rpc("admin_resolve_report", { p_report: r.id, p_status: "dismissed" }))}>
              <XCircle /> Avfärda
            </Button>
          </div>
        </>
      )}
      {r.status !== "open" && r.reported_suspended && (
        <div className="flex flex-wrap items-center gap-2">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={1} maxLength={500} placeholder="Skäl för att häva (minst 10 tecken)" aria-label="Skäl för att häva" className="min-h-9 flex-1" />
          <Button size="sm" variant="outline" disabled={busy || !reasonOk} onClick={() => run("Avstängningen hävd", () => sb().rpc("admin_lift_suspension", { p_user: r.reported_user_id, p_reason: reason.trim() }))}>
            <ShieldCheck /> Häv avstängning
          </Button>
        </div>
      )}
      {r.status === "actioned" && !r.reported_suspended && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="size-3.5" /> Åtgärdad
        </p>
      )}
    </article>
  )
}
