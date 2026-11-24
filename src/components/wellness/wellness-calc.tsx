"use client"

/**
 * Prisstöd i paketbyggaren (v75): snabbval strax under friskvårdstaken och en
 * kompakt kalkyl som uppdateras medan PT:n skriver priset.
 *
 * Räknat på Coaviras faktiska modell: PT:n får hela priset, klienten betalar
 * pris + serviceavgift (Stripes kortavgift betalas av Coavira). Jämförelsen
 * med ett eget portalavtal (ePassi) visar vad PT:n då skulle få netto.
 */
import { Lightbulb } from "lucide-react"

import { formatSek } from "@/lib/money"
import { EXISTING_CLIENT_FEE_PERCENT, PLATFORM_FEE_PERCENT } from "@/lib/payments/fees"
import { cn } from "@/lib/utils"
import { PORTAL_FEE_RANGE, WELLNESS_PRICE_CHIPS, WELLNESS_PRICE_HINT, wellnessCalc } from "@/lib/wellness/pricing"

export function WellnessPriceChips({ value, onPick }: { value: number | undefined; onPick: (price: number) => void }) {
  return (
    <div className="space-y-1.5" data-testid="wellness-price-chips">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Snabbval för friskvårdspris">
        {WELLNESS_PRICE_CHIPS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            aria-pressed={value === p}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium tabular transition-[background-color,border-color,color,scale] duration-150 active:scale-95",
              value === p ? "border-[#84cc16] bg-[#84cc16] text-[#131916]" : "hover:border-[#84cc16]/60 hover:bg-[#84cc16]/10"
            )}
          >
            {formatSek(p)}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{WELLNESS_PRICE_HINT}</p>
    </div>
  )
}

export function WellnessCalcBox({ price, includesNutrition }: { price: number | undefined; includesNutrition: boolean }) {
  if (!price || price < 1) return null
  const c = wellnessCalc(price)
  return (
    <div className="space-y-2 rounded-xl border bg-muted/30 p-3 text-xs" data-testid="wellness-calc" aria-live="polite">
      <div className="space-y-0.5">
        <p className="flex items-baseline justify-between gap-2 text-sm">
          <span className="font-medium">Via Coavira (Stripe + PDF-kvitto)</span>
          <span className="font-semibold tabular" data-testid="calc-net-coavira">
            {formatSek(c.ptNet)} netto
          </span>
        </p>
        <p className="text-muted-foreground">
          Du får hela priset. Klienten betalar {formatSek(c.clientTotalApp)} ({PLATFORM_FEE_PERCENT} % serviceavgift) eller {formatSek(c.clientTotalOwn)} för dina egna
          klienter ({EXISTING_CLIENT_FEE_PERCENT} %). Kortavgiften betalar Coavira.
        </p>
      </div>
      <div className="space-y-0.5">
        <p className="flex items-baseline justify-between gap-2 text-sm">
          <span className="font-medium">Via eget ePassi-avtal</span>
          <span className="tabular" data-testid="calc-net-portal">
            {formatSek(c.portalNetLow)}–{formatSek(c.portalNetHigh)} netto
          </span>
        </p>
        <p className="text-muted-foreground">
          ePassi drar normalt {PORTAL_FEE_RANGE.low}–{PORTAL_FEE_RANGE.high} % i portalavgift. För samma netto som via Coavira behöver priset där vara{" "}
          {formatSek(c.portalPriceForSameNetLow)}–{formatSek(c.portalPriceForSameNetHigh)}.
        </p>
      </div>
      {(c.capTip || !includesNutrition) && (
        <p className="flex items-start gap-1.5 rounded-lg bg-[#84cc16]/12 px-2 py-1.5" data-testid="calc-tip">
          <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-[#84cc16]" aria-hidden />
          <span>
            {c.capTip
              ? `Tips: med serviceavgiften blir klientens kostnad ${formatSek(c.clientTotalApp)} – strax över ${formatSek(c.capTip.cap)}. Sätt priset till ${formatSek(c.capTip.price)} så ryms hela köpet (${formatSek(c.capTip.total)}) i ett bidrag på ${formatSek(c.capTip.cap)}.`
              : "Tips: inkludera kostschema – mer värde i paketet utan att klientens kostnad behöver passera nästa tusental."}
          </span>
        </p>
      )}
    </div>
  )
}
