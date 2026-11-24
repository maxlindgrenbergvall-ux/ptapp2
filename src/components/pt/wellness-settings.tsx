"use client"

/**
 * PT-profil → Friskvård (v75).
 *
 * Egna portalavtal (ePassi, Benifex, Edenred) syns som en badge på profilen och
 * i filtret i Hitta PT. Företagsuppgifterna (företagsnamn, organisationsnummer,
 * adress, moms) står bara på kvitton till PT:ns klienter – aldrig på profilen,
 * eftersom organisationsnumret i en enskild firma är PT:ns personnummer.
 * Sökinstruktionerna visas för klienten i chatten först efter första köpet.
 */
import { HeartPulse, Loader2, ShieldCheck } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAppData } from "@/lib/data/store"
import { EMPTY_BUSINESS, fetchMyBusiness, isBusinessComplete, saveMyBusiness, type TrainerBusiness } from "@/lib/wellness/api"
import { isValidOrgNumber, normalizeOrgNumber } from "@/lib/wellness/identity"

const PORTALS = [
  { key: "acceptsEpassi", label: "Tar emot ePassi" },
  { key: "acceptsBenifex", label: "Tar emot Benifex" },
  { key: "acceptsEdenred", label: "Tar emot Edenred" },
] as const

export function WellnessSettings() {
  const { data, me, actions } = useAppData()
  const trainer = data.trainers.find((t) => t.id === me.id)
  const [business, setBusiness] = React.useState<TrainerBusiness | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [loadError, setLoadError] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    fetchMyBusiness(me).then(
      (b) => alive && setBusiness(b),
      () => {
        if (!alive) return
        setLoadError(true)
        setBusiness({ ...EMPTY_BUSINESS })
      }
    )
    return () => {
      alive = false
    }
  }, [me])

  if (!trainer) return null
  const b = business
  const set = (patch: Partial<TrainerBusiness>) => setBusiness((cur) => (cur ? { ...cur, ...patch } : cur))
  const orgInvalid = Boolean(b?.orgNumber.trim()) && !isValidOrgNumber(b!.orgNumber)

  const save = async () => {
    if (!b || orgInvalid) return
    setSaving(true)
    const error = await saveMyBusiness(me, b)
    setSaving(false)
    if (error) return toast.error("Uppgifterna kunde inte sparas", { description: error })
    if (b.orgNumber.trim()) set({ orgNumber: normalizeOrgNumber(b.orgNumber) ?? b.orgNumber })
    toast.success("Företagsuppgifterna är sparade", {
      description: isBusinessComplete(b) ? "Dina klienter får friskvårdskvitton med uppgifterna." : "Fyll i alla tre för att kunna sälja friskvårdspaket.",
    })
  }

  return (
    <Card className="max-w-2xl scroll-mt-20 gap-4" id="friskvard" data-testid="wellness-settings">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HeartPulse className="size-4 text-[#84cc16]" /> Friskvård
        </CardTitle>
        <CardDescription>Friskvårdsbidrag via Coavira (kvitto som PDF) och dina egna portalavtal.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Egna portalavtal</legend>
          <p className="text-xs text-muted-foreground">Visas som en badge på din profil och i filtret &quot;Friskvård&quot; i Hitta PT.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {PORTALS.map((p) => (
              <label key={p.key} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
                <Checkbox
                  checked={Boolean(trainer[p.key])}
                  onCheckedChange={(v) => actions.updateTrainerProfile({ [p.key]: v === true })}
                  data-testid={`portal-${p.key}`}
                />
                {p.label}
              </label>
            ))}
          </div>
        </fieldset>

        {!b ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Hämtar företagsuppgifterna …
          </p>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
            noValidate
          >
            <div>
              <p className="text-sm font-medium">Företagsuppgifter för friskvårdskvitton</p>
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0" /> Står bara på kvitton till dina klienter – inte på din profil.
              </p>
              {loadError && <p className="text-xs text-destructive">Uppgifterna kunde inte hämtas. Kontrollera nätet och försök igen.</p>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="biz-name">Företagsnamn</Label>
                <Input id="biz-name" value={b.companyName} maxLength={120} onChange={(e) => set({ companyName: e.target.value })} placeholder="Ditt företag AB / Enskild firma" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="biz-org">Organisationsnummer</Label>
                <Input
                  id="biz-org"
                  inputMode="numeric"
                  value={b.orgNumber}
                  maxLength={13}
                  onChange={(e) => set({ orgNumber: e.target.value })}
                  placeholder="NNNNNN-NNNN"
                  aria-invalid={orgInvalid || undefined}
                />
                {orgInvalid && <p className="text-xs text-destructive">Kontrollsiffran stämmer inte – kontrollera numret.</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="biz-address">Företagsadress</Label>
              <Input id="biz-address" value={b.companyAddress} maxLength={200} onChange={(e) => set({ companyAddress: e.target.value })} placeholder="Gatan 1, 123 45 Ort" />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={b.vatRegistered} onCheckedChange={(v) => set({ vatRegistered: v === true })} className="mt-0.5" />
              <span>
                Momsregistrerad
                <span className="block text-xs text-muted-foreground">
                  Kvittot specificerar 6 % moms. Utan momsregistrering står &quot;Säljaren är inte momsregistrerad&quot;. Stäm av momssatsen för just dina tjänster
                  med din redovisningskonsult.
                </span>
              </span>
            </label>
            <div className="space-y-1.5">
              <Label htmlFor="biz-instructions">Instruktioner i portalerna (valfritt)</Label>
              <Textarea
                id="biz-instructions"
                rows={3}
                maxLength={600}
                value={b.wellnessInstructions}
                onChange={(e) => set({ wellnessInstructions: e.target.value })}
                placeholder='T.ex. "Sök på Petra Friskvård i ePassi och välj Personlig träning."'
              />
              <p className="text-xs text-muted-foreground">Visas för klienten i chatten efter första köpet, eller direkt för dina egna klienter.</p>
            </div>
            <Button type="submit" disabled={saving || orgInvalid} data-testid="save-business">
              {saving && <Loader2 className="animate-spin" />} Spara företagsuppgifter
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
