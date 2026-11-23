"use client"

/**
 * Rapportera ett meddelande (v65): kategori och valfri beskrivning. Rapporten
 * granskas manuellt av Coavira; den rapporterade får inte veta vem som rapporterade.
 */
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { REPORT_CATEGORIES, reportContent, type ReportCategory } from "@/lib/account-status"
import { cn } from "@/lib/utils"

export function ReportDialog({
  open,
  onOpenChange,
  reportedUserId,
  messageId,
  name,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  reportedUserId: string
  messageId?: string
  name?: string
}) {
  const [category, setCategory] = React.useState<ReportCategory | null>(null)
  const [details, setDetails] = React.useState("")
  const [sending, setSending] = React.useState(false)

  const send = async () => {
    if (!category || sending) return
    setSending(true)
    try {
      await reportContent({ reportedUserId, messageId, category, details })
      toast.success("Tack för din rapport", { description: "Vi granskar den manuellt. Den du rapporterade får inte veta att det var du." })
      onOpenChange(false)
      setCategory(null)
      setDetails("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rapporten kunde inte skickas")
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="report-dialog">
        <DialogHeader>
          <DialogTitle>Rapportera meddelandet</DialogTitle>
          <DialogDescription>
            Bryter meddelandet{name ? ` från ${name}` : ""} mot communityreglerna? Välj vad det gäller.
          </DialogDescription>
        </DialogHeader>
        <div role="radiogroup" aria-label="Vad gäller det?" className="grid gap-1.5">
          {REPORT_CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={category === c.value}
              onClick={() => setCategory(c.value)}
              className={cn(
                "min-h-11 rounded-xl border px-3 text-left text-sm transition-colors",
                category === c.value ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="report-details">Beskriv gärna (valfritt)</Label>
          <Textarea id="report-details" value={details} maxLength={1000} onChange={(e) => setDetails(e.target.value)} rows={3} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={send} disabled={!category || sending} data-testid="send-report">
            {sending ? "Skickar …" : "Skicka rapport"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
