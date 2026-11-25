"use client"

/**
 * Granskning av friskvårdsportaler (v81) – /admin/friskvard. PT:n har skickat
 * in leverantörs-ID, ett bevis (skärmdump eller avtal) och intygat avtalet.
 * Admin öppnar beviset (kortlivad länk från den privata bucketen) och godkänner
 * eller nekar med ett klick. Nekande kräver ett kort skäl som PT:n ser.
 */
import { BadgeCheck, ExternalLink, HeartPulse, Loader2, XCircle } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import { cn } from "@/lib/utils"
import { type AdminVerification, adminListVerifications, adminReview, PORTAL_LABEL, proofUrl } from "@/lib/wellness/verification"

const when = (iso: string) => new Date(iso).toLocaleString("sv-SE", { dateStyle: "medium", timeStyle: "short" })
const STATUS: Record<AdminVerification["status"], string> = { pending: "Granskas", verified: "Verifierad", rejected: "Nekad" }

export function WellnessReviewDashboard() {
  const [filter, setFilter] = React.useState<"pending" | "all">("pending")
  const [rows, setRows] = React.useState<AdminVerification[] | null>(isSupabaseEnabled ? null : [])
  const [error, setError] = React.useState<string | null>(null)
  const [version, setVersion] = React.useState(0)

  React.useEffect(() => {
    if (!isSupabaseEnabled) return
    let alive = true
    adminListVerifications(filter).then(
      (r) => {
        if (!alive) return
        setRows(r)
        setError(null)
      },
      (e: Error) => alive && setError(e.message)
    )
    return () => {
      alive = false
    }
  }, [filter, version])

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-6" data-testid="wellness-review">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <HeartPulse className="size-5 text-primary" /> Friskvårdsportaler
          </h1>
          <p className="text-sm text-muted-foreground">Granska beviset och godkänn eller neka med ett klick.</p>
        </div>
        <div className="flex rounded-xl bg-muted p-1 text-sm" role="tablist">
          {(["pending", "all"] as const).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={cn("rounded-lg px-3 py-1.5", filter === f && "bg-background font-medium shadow-xs")}>
              {f === "pending" ? "Att granska" : "Alla"}
            </button>
          ))}
        </div>
      </div>
      {!isSupabaseEnabled && <p className="rounded-xl border p-4 text-sm text-muted-foreground">Demoläge – granskningen finns bara med Supabase.</p>}
      {error && <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {rows === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Hämtar …
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">Inget att granska.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <ReviewRow key={r.trainerId} row={r} onDone={() => setVersion((v) => v + 1)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ReviewRow({ row, onDone }: { row: AdminVerification; onDone: () => void }) {
  const [busy, setBusy] = React.useState<"approve" | "reject" | "proof" | null>(null)
  const [rejecting, setRejecting] = React.useState(false)
  const [note, setNote] = React.useState("")

  const openProof = async () => {
    setBusy("proof")
    const url = await proofUrl(row.proofPath)
    setBusy(null)
    if (!url) return void toast.error("Beviset kunde inte öppnas")
    window.open(url, "_blank", "noopener,noreferrer")
  }
  const review = async (approve: boolean) => {
    setBusy(approve ? "approve" : "reject")
    const error = await adminReview(row.trainerId, approve, approve ? undefined : note)
    setBusy(null)
    if (error) return void toast.error(error)
    toast.success(approve ? `${row.trainerName} är verifierad` : `${row.trainerName} är nekad`)
    onDone()
  }

  return (
    <li className="space-y-3 rounded-2xl border bg-card p-4" data-testid="wellness-review-row" data-status={row.status}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{row.trainerName}</p>
          <p className="text-sm text-muted-foreground">
            {row.portals.map((p) => PORTAL_LABEL[p] ?? p).join(", ")} · ID: <span className="font-medium text-foreground">{row.merchantId}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Intygat {when(row.attestedAt)}
            {row.reviewNote ? ` · ${row.reviewNote}` : ""}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            row.status === "verified" ? "bg-[#84cc16]/15 text-[#a3e635]" : row.status === "rejected" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"
          )}
        >
          {STATUS[row.status]}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => void openProof()} disabled={busy !== null} data-testid="wellness-open-proof">
          {busy === "proof" ? <Loader2 className="animate-spin" /> : <ExternalLink />} Visa bevis
        </Button>
        {row.status !== "verified" && (
          <Button size="sm" onClick={() => void review(true)} disabled={busy !== null} data-testid="wellness-approve">
            {busy === "approve" ? <Loader2 className="animate-spin" /> : <BadgeCheck />} Godkänn
          </Button>
        )}
        {row.status !== "rejected" && !rejecting && (
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setRejecting(true)} disabled={busy !== null} data-testid="wellness-reject">
            <XCircle /> Neka
          </Button>
        )}
      </div>
      {rejecting && (
        <div className="flex gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Kort skäl till PT:n" maxLength={500} className="h-9" data-testid="wellness-reject-note" />
          <Button size="sm" variant="destructive" onClick={() => void review(false)} disabled={busy !== null || note.trim().length < 5} data-testid="wellness-reject-confirm">
            {busy === "reject" && <Loader2 className="animate-spin" />} Neka
          </Button>
        </div>
      )}
    </li>
  )
}
