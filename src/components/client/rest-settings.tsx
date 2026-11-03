"use client"

import { BellRing, Timer } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { NumberInput } from "@/components/ui/number-input"
import { formatRest, REST_MAX, REST_MIN, REST_PRESETS, requestWebNotificationPermission, useRestPreference } from "@/lib/rest-timer"
import { cn } from "@/lib/utils"

/** 45 s, 1 min, 1,5 min, 2 min, 3 min. */
const presetLabel = (s: number) => (s < 60 ? `${s} s` : `${(s / 60).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} min`)

/**
 * Vilotid (v32): snabbval 45 s – 3 min eller egen tid, om passets vilotider
 * ska följas eller alltid min egen, och ljud/vibration + notis när vilan är slut.
 */
export function RestSettingsFields() {
  const [pref, set] = useRestPreference()
  const [custom, setCustom] = React.useState<number | undefined>(pref.seconds)
  return (
    <div className="space-y-4" data-testid="rest-settings">
      <div className="space-y-2">
        <Label>Min vilotid</Label>
        <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Vilotid">
          {REST_PRESETS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={pref.seconds === s}
              onClick={() => (set({ seconds: s }), setCustom(s))}
              className={cn(
                "min-h-11 rounded-xl border text-sm tabular transition-colors",
                pref.seconds === s ? "border-primary bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted/60"
              )}
            >
              {presetLabel(s)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="rest-custom" className="text-xs font-normal text-muted-foreground">
            Egen tid (sekunder)
          </Label>
          <NumberInput
            id="rest-custom"
            min={REST_MIN}
            max={REST_MAX}
            value={custom}
            onValueChange={setCustom}
            onBlur={() => custom !== undefined && set({ seconds: custom })}
            className="h-10 w-24 tabular"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Vilka vilotider gäller?</Label>
        <div className="grid gap-1.5" role="radiogroup" aria-label="Vilka vilotider gäller">
          {(
            [
              ["exercise", "Passets vilotider", "PT:ns (eller passets) vila per övning – min tid när den saknas"],
              ["fixed", "Alltid min vilotid", `${formatRest(pref.seconds)} efter varje set`],
            ] as const
          ).map(([mode, title, hint]) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={pref.mode === mode}
              onClick={() => set({ mode })}
              className={cn("rounded-xl border px-3 py-2 text-left transition-colors", pref.mode === mode ? "border-primary bg-primary/8 ring-1 ring-primary" : "hover:bg-muted/60")}
            >
              <span className="block text-sm font-medium">{title}</span>
              <span className="block text-xs text-muted-foreground">{hint}</span>
            </button>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={pref.alert}
          onCheckedChange={(v) => {
            set({ alert: v === true })
            if (v === true) requestWebNotificationPermission()
          }}
        />
        <BellRing className="size-4 text-muted-foreground" /> Ljud, vibration och notis när vilan är slut
      </label>
    </div>
  )
}

/** Knappen i passvyn ("Vila 90 s") som öppnar inställningen – före eller under passet. */
export function RestSettingsButton({ className }: { className?: string }) {
  const [pref] = useRestPreference()
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-8 gap-1 rounded-full px-2.5 text-xs", className)} data-testid="rest-settings-button">
          <Timer className="size-3.5" />
          {pref.mode === "fixed" ? formatRest(pref.seconds) : "Vila"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Vilotid</DialogTitle>
          <DialogDescription>Gäller direkt – även mitt i passet. Sparas på den här enheten.</DialogDescription>
        </DialogHeader>
        <RestSettingsFields />
      </DialogContent>
    </Dialog>
  )
}
