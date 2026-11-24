"use client"

/**
 * "Ladda ner friskvårdskvitto (PDF)" (v75) – på orderbekräftelsen och under
 * Profil → Betalningar & kvitton. Klienten kan fylla i sitt personnummer före
 * nedladdningen; det skrivs bara in i PDF:en och skickas eller sparas aldrig.
 */
import { FileDown, Loader2, ShieldCheck } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAppData } from "@/lib/data/store"
import { fetchReceipt } from "@/lib/wellness/api"
import { normalizePersonnummer } from "@/lib/wellness/identity"
import { buildReceiptPdf, receiptFileName, saveReceiptPdf, type WellnessReceipt } from "@/lib/wellness/receipt"
import { formatSek } from "@/lib/money"
import { cn } from "@/lib/utils"

export function ReceiptButton({ checkoutId, className, size = "default" }: { checkoutId: string; className?: string; size?: "default" | "sm" }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button type="button" variant="outline" size={size} className={cn("gap-1.5", className)} onClick={() => setOpen(true)} data-testid="receipt-download">
        <FileDown /> Ladda ner friskvårdskvitto (PDF)
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">{open && <ReceiptForm checkoutId={checkoutId} onDone={() => setOpen(false)} />}</DialogContent>
      </Dialog>
    </>
  )
}

function ReceiptForm({ checkoutId, onDone }: { checkoutId: string; onDone: () => void }) {
  const { data: live } = useAppData()
  // Datan när dialogen öppnades – kvittot hämtas en gång, inte vid varje uppdatering.
  const [data] = React.useState(live)
  const [receipt, setReceipt] = React.useState<WellnessReceipt | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [pnr, setPnr] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    fetchReceipt(data, checkoutId).then(
      (r) => alive && setReceipt(r),
      (e: unknown) => alive && setError(e instanceof Error ? e.message : "Kvittot kunde inte hämtas")
    )
    return () => {
      alive = false
    }
  }, [data, checkoutId])

  const pnrValue = pnr.trim()
  const pnrNormalized = pnrValue ? normalizePersonnummer(pnrValue) : null
  const pnrInvalid = Boolean(pnrValue) && !pnrNormalized

  const download = async () => {
    if (!receipt || pnrInvalid) return
    setBusy(true)
    try {
      const bytes = await buildReceiptPdf(receipt, { personnummer: pnrNormalized })
      await saveReceiptPdf(bytes, receiptFileName(receipt))
      toast.success("Kvittot är sparat", { description: "Skicka det till din arbetsgivare eller ladda upp det i friskvårdsportalen." })
      onDone()
    } catch {
      toast.error("Kvittot kunde inte skapas. Försök igen.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4" data-testid="receipt-dialog">
      <DialogHeader>
        <DialogTitle>Friskvårdskvitto</DialogTitle>
        <DialogDescription>Ett kvitto med det underlag din arbetsgivare behöver för friskvårdsbidraget.</DialogDescription>
      </DialogHeader>
      {error ? (
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : !receipt ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Hämtar kvittot …
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl border p-3 text-sm" data-testid="receipt-summary">
            <dt className="text-muted-foreground">Kvitto</dt>
            <dd className="tabular">{receipt.receiptNumber}</dd>
            <dt className="text-muted-foreground">Säljare</dt>
            <dd>
              {receipt.seller.companyName || receipt.seller.name}
              {receipt.seller.orgNumber && <span className="text-muted-foreground tabular"> · {receipt.seller.orgNumber}</span>}
            </dd>
            <dt className="text-muted-foreground">Belopp</dt>
            <dd className="tabular">{formatSek(receipt.totalSek)}</dd>
          </dl>
          {!receipt.seller.complete && (
            <p className="rounded-xl border border-warning/50 bg-warning/10 px-3 py-2 text-sm" data-testid="receipt-incomplete">
              PT:n har inte fyllt i alla företagsuppgifter än (organisationsnummer och adress). Kvittot går att ladda ner, men be PT:n komplettera
              innan du skickar det till din arbetsgivare.
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="receipt-pnr">Personnummer (valfritt)</Label>
            <Input
              id="receipt-pnr"
              inputMode="numeric"
              autoComplete="off"
              placeholder="ÅÅÅÅMMDD-NNNN"
              value={pnr}
              onChange={(e) => setPnr(e.target.value.slice(0, 15))}
              aria-invalid={pnrInvalid || undefined}
            />
            {pnrInvalid ? (
              <p className="text-xs text-destructive">Personnumret ser inte rätt ut – kontrollera siffrorna.</p>
            ) : (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0" /> Vissa arbetsgivare vill ha det på kvittot. Det skrivs bara in i PDF:en – vi sparar det inte.
              </p>
            )}
          </div>
        </>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Stäng
        </Button>
        <Button type="button" onClick={download} disabled={!receipt || pnrInvalid || busy} data-testid="receipt-save">
          {busy ? <Loader2 className="animate-spin" /> : <FileDown />} Ladda ner PDF
        </Button>
      </DialogFooter>
    </div>
  )
}
