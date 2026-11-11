import { AnimatedNumber, FillBar } from "@/components/motion"
import { cn } from "@/lib/utils"

/**
 * Färgkodning för makronäringsämnen, samma överallt i appen:
 * Protein = blå, Kolhydrater = gul/orange, Fett = rosa.
 * Färgen bär bara identitet; värden och etiketter står alltid i text bredvid
 * (färgerna har låg kontrast mot ljus bakgrund och ska aldrig stå ensamma).
 */
export const MACROS = [
  { key: "protein", label: "Protein", short: "P", kcalPerGram: 4, dot: "bg-macro-protein" },
  { key: "carbs", label: "Kolhydrater", short: "K", kcalPerGram: 4, dot: "bg-macro-carbs" },
  { key: "fat", label: "Fett", short: "F", kcalPerGram: 9, dot: "bg-macro-fat" },
] as const

export type MacroKey = (typeof MACROS)[number]["key"]
export type Macros = Record<MacroKey, number>

export function MacroDot({ macro, className }: { macro: MacroKey; className?: string }) {
  const m = MACROS.find((x) => x.key === macro)!
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", m.dot, className)} />
}

/** Kompakt rad: "● P 35 g ● K 50 g ● F 12 g". */
export function MacroInline({ value, className }: { value: Macros; className?: string }) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground tabular", className)}>
      {MACROS.map((m) => (
        <span key={m.key} className="inline-flex items-center gap-1">
          <MacroDot macro={m.key} />
          <span className="sr-only">{m.label}</span>
          <span aria-hidden>{m.short}</span> {Math.round(value[m.key])} g
        </span>
      ))}
    </span>
  )
}

/** Fördelning av energin mellan makron som en staplad stapel (2 px mellanrum mellan segment). */
export function MacroSplitBar({ value, className }: { value: Macros; className?: string }) {
  const kcal = MACROS.map((m) => ({ ...m, kcal: value[m.key] * m.kcalPerGram }))
  const total = kcal.reduce((s, m) => s + m.kcal, 0)
  const label = total
    ? kcal.map((m) => `${m.label} ${Math.round((m.kcal / total) * 100)} %`).join(", ")
    : "Inga makron än"
  return (
    <div role="img" aria-label={`Energifördelning: ${label}`} className={cn("flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-muted", className)}>
      {total > 0 &&
        kcal.map((m) =>
          m.kcal > 0 ? <span key={m.key} className={cn("h-full first:rounded-l-full last:rounded-r-full", m.dot)} style={{ width: `${(m.kcal / total) * 100}%` }} /> : null
        )}
    </div>
  )
}

/** Ett makro mot sitt mål: etikett, värde/mål och en tunn stapel i makrots färg. */
export function MacroTargetRow({ macro, value, target }: { macro: MacroKey; value: number; target: number }) {
  const m = MACROS.find((x) => x.key === macro)!
  const pct = target > 0 ? Math.round((value / target) * 100) : 0
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2">
          <MacroDot macro={macro} className="size-2.5" />
          {m.label}
        </span>
        <span className="tabular">
          <AnimatedNumber value={value} className="font-medium" />
          <span className="text-muted-foreground"> / {target} g</span>
        </span>
      </div>
      <FillBar
        value={pct}
        className="h-1.5"
        barClassName={m.dot}
        role="progressbar"
        aria-label={m.label}
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={target}
      />
    </div>
  )
}

/**
 * Kalorier mot mål, i varumärkesgrönt. När något loggas räknar siffrorna mjukt
 * till sitt nya värde och stapeln glider mot målet (v46), så att man ser hur
 * mycket utrymme som är kvar. Över målet byter "kvar" till "över" i varningsfärg.
 */
export function KcalMeter({ value, target, className }: { value: number; target: number; className?: string }) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0
  const diff = target - value
  const over = diff < 0
  return (
    <div className={cn("space-y-2", className)} data-testid="kcal-meter">
      <div className="flex items-end justify-between gap-2">
        <div>
          <AnimatedNumber value={value} format={(n) => String(Math.round(n))} className="block text-3xl font-semibold tracking-tight tabular" />
          <div className="text-xs text-muted-foreground tabular">av {target} kcal</div>
        </div>
        <div className={cn("text-right text-xs tabular transition-colors duration-300", over ? "font-medium text-warning" : "text-muted-foreground")}>
          <AnimatedNumber value={Math.abs(diff)} format={(n) => String(Math.round(n))} /> {over ? "över" : "kvar"}
        </div>
      </div>
      <FillBar
        value={pct}
        className="bg-primary/15"
        barClassName={cn("transition-[transform,background-color]", over && "bg-warning")}
        role="progressbar"
        aria-label="Kalorier"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={target}
      />
    </div>
  )
}

export function sumMacros<T extends { kcal: number; protein: number; carbs: number; fat: number }>(items: T[]) {
  return items.reduce(
    (t, i) => ({ kcal: t.kcal + i.kcal, protein: t.protein + i.protein, carbs: t.carbs + i.carbs, fat: t.fat + i.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  )
}
