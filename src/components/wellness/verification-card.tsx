"use client"

/**
 * Verifieringskortet för friskvårdsportaler (v81) – i PT-introts steg 1 och
 * under Profil → Friskvård. Tre obligatoriska delar: leverantörs-ID, bevis
 * (skärmdump/avtal) och intygandet. Under granskning: en diskret
 * "Granskas"-badge. Godkänd: "Verifierad".
 */
import { AnimatePresence, motion } from "framer-motion"
import { BadgeCheck, Clock, FileUp, Loader2, ShieldAlert } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAppData } from "@/lib/data/store"
import { cn } from "@/lib/utils"
import {
  ATTESTATION_TEXT,
  fetchMyVerification,
  type MyVerification,
  PORTAL_LABEL,
  PROOF_ACCEPT,
  type PortalFlags,
  portalKeys,
  proofError,
  submitVerification,
} from "@/lib/wellness/verification"

const EASE = [0.22, 1, 0.36, 1] as const

export function WellnessVerificationCard({ portals, className }: { portals: PortalFlags; className?: string }) {
  const { data, me, actions } = useAppData()
  const trainer = data.trainers.find((t) => t.id === me.id)
  const keys = portalKeys(portals)
  const [mine, setMine] = React.useState<MyVerification | null>(null)
  const [merchantId, setMerchantId] = React.useState("")
  const [file, setFile] = React.useState<File | null>(null)
  const [attested, setAttested] = React.useState(false)
  const [showErrors, setShowErrors] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    let alive = true
    void fetchMyVerification(me).then((v) => {
      if (!alive || !v) return
      setMine(v)
      setMerchantId((cur) => cur || v.merchantId)
    })
    return () => {
      alive = false
    }
  }, [me])

  if (!trainer || keys.length === 0) return null
  const status = trainer.wellnessVerificationStatus ?? "none"
  // Portalerna som granskas just nu: en ny portal (inte i inskicket) kräver ett nytt inskick.
  const covered = mine && keys.every((k) => mine.portals.includes(k))
  const shown = status === "pending" && !covered ? "none" : status

  if (shown === "verified" || shown === "pending") {
    const verified = shown === "verified"
    return (
      <p
        className={cn(
          "flex items-center gap-2 rounded-xl px-3 py-2 text-sm",
          verified ? "bg-[#84cc16]/12 text-[#3f6212] dark:text-[#a3e635]" : "bg-muted/60 text-muted-foreground",
          className
        )}
        data-testid="wellness-verification"
        data-status={shown}
      >
        {verified ? <BadgeCheck className="size-4 shrink-0" /> : <Clock className="size-4 shrink-0" />}
        <span className="font-medium">{verified ? "Verifierad av Coavira" : "Granskas"}</span>
        <span className="text-xs opacity-80">· {keys.map((k) => PORTAL_LABEL[k]).join(", ")}</span>
      </p>
    )
  }

  const errors = {
    merchant: merchantId.trim().length < 2,
    file: proofError(file),
    attest: !attested,
  }
  const submit = async () => {
    if (errors.merchant || errors.file || errors.attest) {
      setShowErrors(true)
      return
    }
    setBusy(true)
    const error = await submitVerification(me, { merchantId, file: file!, attested, portals })
    setBusy(false)
    if (error) return void toast.error("Kunde inte skicka in", { description: error })
    setMine({ merchantId: merchantId.trim(), status: "pending", portals: keys, submittedAt: new Date().toISOString() })
    actions.setWellnessVerificationStatus("pending")
    toast.success("Skickat för granskning", { description: "Badgen syns i Hitta PT när Coavira har godkänt avtalet." })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className={cn("space-y-3 rounded-2xl border border-[#84cc16]/30 bg-[#84cc16]/6 p-4", className)}
      data-testid="wellness-verification"
      data-status={shown}
    >
      <div>
        <p className="text-sm font-semibold">Verifiera {keys.map((k) => PORTAL_LABEL[k]).join(", ")}</p>
        <p className="text-xs text-muted-foreground">Krävs för badgen och filtret i Hitta PT.</p>
      </div>
      {shown === "rejected" && mine?.reviewNote && (
        <p className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive" data-testid="wellness-rejected">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" /> {mine.reviewNote}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="wellness-merchant-id" className="text-xs text-muted-foreground">
          1. Leverantörs-ID eller namn i portalen
        </Label>
        <Input
          id="wellness-merchant-id"
          className="h-11 rounded-xl bg-background/70"
          value={merchantId}
          maxLength={120}
          onChange={(e) => setMerchantId(e.target.value)}
          placeholder="T.ex. Petra PT AB / 4711"
          aria-invalid={(showErrors && errors.merchant) || undefined}
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">2. Skärmdump från partnerportalen eller avtalsbekräftelse</p>
        <input
          ref={fileRef}
          type="file"
          accept={PROOF_ACCEPT}
          className="sr-only"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          data-testid="wellness-proof"
          aria-label="Ladda upp bevis"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={cn(
            "flex h-11 w-full items-center gap-2 rounded-xl border border-dashed bg-background/70 px-3 text-left text-sm transition-colors hover:border-[#84cc16]/60",
            showErrors && errors.file && "border-destructive"
          )}
        >
          <FileUp className="size-4 shrink-0 text-[#84cc16]" />
          <span className={cn("min-w-0 flex-1 truncate", !file && "text-muted-foreground")}>{file ? file.name : "Välj bild eller PDF"}</span>
        </button>
        <AnimatePresence initial={false}>
          {showErrors && errors.file && (
            <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="text-xs text-destructive">
              {errors.file}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <label className={cn("flex items-start gap-2.5 text-xs leading-relaxed", showErrors && errors.attest && "text-destructive")}>
        <Checkbox checked={attested} onCheckedChange={(v) => setAttested(v === true)} className="mt-0.5" data-testid="wellness-attest" aria-invalid={(showErrors && errors.attest) || undefined} />
        <span>3. {ATTESTATION_TEXT}</span>
      </label>

      <Button type="button" className="h-11 w-full rounded-xl" onClick={() => void submit()} disabled={busy} data-testid="wellness-submit">
        {busy && <Loader2 className="animate-spin" />} Skicka för granskning
      </Button>
    </motion.div>
  )
}
