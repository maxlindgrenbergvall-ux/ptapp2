"use client"

import { Droplet, Minus, Moon, Pencil, Plus, RefreshCw, Unplug, Watch, X } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { FoodPicker } from "@/components/nutrition/food-picker"
import { MacroInline } from "@/components/nutrition/macros"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAppData } from "@/lib/data/store"
import { addDays, formatShort, todayISO } from "@/lib/date"
import { kcalFromMacros } from "@/lib/foods"
import { getSupabase } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { mockSleepRange } from "@/lib/wearables/mock"
import { PROVIDER_LABEL } from "@/lib/wearables/types"
import type { FoodProduct, ISODate, SleepLog, WearableProvider } from "@/types/domain"

// ================================================================ extra mat ===

/**
 * "Övrigt / Extra": mat utanför kostschemat. Sök i baslivsmedel, egna produkter
 * och märkesvaror, eller skanna streckkoden.
 */
export function ExtraFood({ date }: { date: ISODate }) {
  const { data, me, actions } = useAppData()
  const entries = data.foodEntries.filter((e) => e.clientId === me.id && e.date === date)
  const [manual, setManual] = React.useState(false)

  // Senaste: unika produkter som loggats med gram, nyast först – så att vanliga val går på ett tryck.
  const recent = React.useMemo(() => {
    const seen = new Set<string>()
    const out: FoodProduct[] = []
    for (const e of [...data.foodEntries].filter((x) => x.clientId === me.id && x.grams).reverse()) {
      const key = e.barcode ?? e.productId ?? e.name
      if (seen.has(key)) continue
      seen.add(key)
      const f = 100 / e.grams!
      out.push({
        id: e.productId ?? `recent:${key}`,
        name: e.name,
        barcode: e.barcode,
        per100: { kcal: e.kcal * f, protein: e.protein * f, carbs: e.carbs * f, fat: e.fat * f },
        servingG: e.grams,
        unit: e.unit,
        source: e.barcode ? "openfoodfacts" : "library",
      })
      if (out.length >= 12) break
    }
    return out
  }, [data.foodEntries, me.id])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Övrigt / extra</h3>
        {!manual && (
          <button className="text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={() => setManual(true)}>
            Egen rad (bara kcal)
          </button>
        )}
      </div>

      {entries.length > 0 && (
        <ul className="divide-y rounded-xl bg-muted/50">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-baseline gap-1">
                  <span className="truncate">{e.name}</span>
                  {e.grams ? <span className="shrink-0 text-xs text-muted-foreground tabular">· {e.grams.toLocaleString("sv-SE")} {e.unit ?? "g"}</span> : null}
                </div>
                <MacroInline value={e} />
              </div>
              <span className="shrink-0 tabular">{e.kcal} kcal</span>
              <button className="shrink-0 rounded p-1 text-muted-foreground hover:bg-background" aria-label={`Ta bort ${e.name}`} onClick={() => actions.deleteFoodEntry(e.id)}>
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {manual ? (
        <ManualFoodForm
          onCancel={() => setManual(false)}
          onAdd={(f) => {
            actions.addFoodEntry(date, f)
            setManual(false)
          }}
        />
      ) : (
        <FoodPicker
          recent={recent}
          customFoods={data.customFoods}
          onSaveCustom={actions.saveCustomFood}
          onAdd={(entry) => actions.addFoodEntry(date, entry)}
        />
      )}
    </div>
  )
}

function ManualFoodForm({
  onAdd,
  onCancel,
}: {
  onAdd: (f: { name: string; kcal: number; protein: number; carbs: number; fat: number }) => void
  onCancel: () => void
}) {
  const [f, setF] = React.useState({ name: "", kcal: "", protein: "", carbs: "", fat: "" })
  const n = (v: string) => Math.max(0, Number(v.replace(",", ".")) || 0)
  return (
    <form
      className="space-y-2 rounded-xl border p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!f.name.trim()) return toast.error("Skriv vad du åt")
        const protein = n(f.protein)
        const carbs = n(f.carbs)
        const fat = n(f.fat)
        // Saknas kcal räknas det ut från makrona (om de angetts).
        const kcal = f.kcal ? n(f.kcal) : kcalFromMacros(protein, carbs, fat)
        onAdd({ name: f.name.trim().slice(0, 120), kcal: Math.round(kcal), protein, carbs, fat })
      }}
    >
      <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Vad åt du? T.ex. Kanelbulle" aria-label="Namn" autoFocus />
      <div className="grid grid-cols-4 gap-2">
        {(
          [
            ["kcal", "kcal"],
            ["protein", "Protein g"],
            ["carbs", "Kolh. g"],
            ["fat", "Fett g"],
          ] as const
        ).map(([k, label]) => (
          <Input key={k} inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={label} aria-label={label} className="text-sm" />
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Avbryt
        </Button>
        <Button type="submit" size="sm">
          Lägg till
        </Button>
      </div>
    </form>
  )
}

// =================================================================== vatten ===

const GLASS = 250

/** Vattenmål: 35 ml per kg kroppsvikt (avrundat till glas), annars 2,5 l. */
function waterGoal(weightKg?: number) {
  if (!weightKg) return 2500
  return Math.min(4500, Math.max(1500, Math.round((weightKg * 35) / GLASS) * GLASS))
}

export function WaterTracker({ date }: { date: ISODate }) {
  const { data, me, actions } = useAppData()
  const ml = data.waterLogs.find((w) => w.clientId === me.id && w.date === date)?.ml ?? 0
  const weight = data.clients.find((c) => c.id === me.id)?.weightLog.at(-1)?.kg
  const goal = waterGoal(weight)
  const glasses = goal / GLASS
  const filled = Math.floor(ml / GLASS)
  const pct = Math.min(100, Math.round((ml / goal) * 100))

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5" aria-labelledby="water-title">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="water-title" className="flex items-center gap-2 font-semibold">
            <Droplet className="size-4 text-water" /> Vatten
          </h2>
          <p className="text-xs text-muted-foreground">Mål {(goal / 1000).toLocaleString("sv-SE")} l</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular">{(ml / 1000).toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} l</div>
          <div className="text-xs text-muted-foreground tabular">{pct} %</div>
        </div>
      </div>

      {/* Ett glas per 250 ml – tryck på ett glas för att fylla upp till det. */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${filled} av ${glasses} glas`}>
        {Array.from({ length: glasses }, (_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`${(i + 1) * GLASS} ml`}
            onClick={() => actions.addWater(date, (i + 1) * GLASS - ml)}
            className={cn(
              "h-9 w-6 rounded-b-lg rounded-t-sm border-2 transition-colors",
              i < filled ? "border-water bg-water" : "border-water/30 hover:border-water/60"
            )}
          />
        ))}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="icon" aria-label="Ta bort ett glas" onClick={() => actions.addWater(date, -GLASS)} disabled={ml === 0}>
          <Minus />
        </Button>
        <Button variant="secondary" className="flex-1" onClick={() => actions.addWater(date, GLASS)}>
          <Plus /> Glas · 250 ml
        </Button>
        <Button variant="secondary" className="flex-1" onClick={() => actions.addWater(date, 500)}>
          <Plus /> Flaska · 500 ml
        </Button>
      </div>
    </section>
  )
}

// ==================================================================== sömn ===

const QUALITY = ["Dålig", "Sådär", "Okej", "Bra", "Utmärkt"]

export function SleepTracker({ date }: { date: ISODate }) {
  const { data, me, actions } = useAppData()
  const logs = data.sleepLogs.filter((l) => l.clientId === me.id)
  const tonight = logs.find((l) => l.date === date)
  const [editing, setEditing] = React.useState(false)

  const week = logs.filter((l) => l.date > addDays(date, -7) && l.date <= date)
  const avg = week.length ? week.reduce((s, l) => s + l.hours, 0) / week.length : null

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5" aria-labelledby="sleep-title">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="sleep-title" className="flex items-center gap-2 font-semibold">
            <Moon className="size-4 text-primary" /> Sömn i natt
          </h2>
          <p className="text-xs text-muted-foreground">
            {avg !== null ? `Snitt 7 nätter: ${avg.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} h` : "Ingen sömn loggad än"}
          </p>
        </div>
        {tonight && !editing && (
          <Button variant="ghost" size="icon-sm" aria-label="Ändra" onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
        )}
      </div>

      {tonight && !editing ? (
        <SleepSummary log={tonight} />
      ) : (
        <SleepForm
          initial={tonight}
          onSave={(hours, quality) => {
            actions.logSleep(date, hours, quality)
            setEditing(false)
            toast.success("Sömnen är sparad")
          }}
          onCancel={tonight ? () => setEditing(false) : undefined}
        />
      )}
      <SleepWeek logs={logs} today={date} />
    </section>
  )
}

function SleepSummary({ log }: { log: SleepLog }) {
  const total = log.stages ? log.stages.deep + log.stages.light + log.stages.rem + log.stages.awake : 0
  const fromDevice = log.source !== "manual"
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-6">
        <div>
          <div className="text-3xl font-semibold tracking-tight tabular">{log.hours.toLocaleString("sv-SE")} h</div>
          <div className="text-xs text-muted-foreground">
            {fromDevice ? `Från ${log.source === "mock" ? "klockan (demo)" : PROVIDER_LABEL[log.source as WearableProvider]}` : "Manuellt"}
          </div>
        </div>
        {log.sleepScore !== undefined && (
          <div>
            <div className="text-3xl font-semibold tracking-tight text-primary tabular">{log.sleepScore}</div>
            <div className="text-xs text-muted-foreground">Sömnpoäng{log.source !== "manual" && " (beräknad)"}</div>
          </div>
        )}
        {log.quality !== undefined && (
          <div>
            <div className="text-lg font-semibold">{QUALITY[log.quality - 1]}</div>
            <div className="text-xs text-muted-foreground">Känsla</div>
          </div>
        )}
      </div>
      {log.stages && total > 0 && (
        <div className="space-y-2">
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Sömnsteg">
            {STAGES.map((s) => (
              <span key={s.key} className={cn("h-full", s.className)} style={{ width: `${(log.stages![s.key] / total) * 100}%` }} />
            ))}
          </div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
            {STAGES.map((s) => (
              <li key={s.key} className="flex items-center gap-1">
                <span aria-hidden className={cn("size-2 rounded-full", s.className)} />
                {s.label} <span className="ml-auto text-foreground tabular whitespace-nowrap sm:ml-0">{fmtMin(log.stages![s.key])}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// Ett tonat grönt per steg, djupast = mörkast/starkast. Etiketter står alltid bredvid.
const STAGES = [
  { key: "deep", label: "Djup", className: "bg-primary" },
  { key: "rem", label: "REM", className: "bg-primary/65" },
  { key: "light", label: "Lätt", className: "bg-primary/35" },
  { key: "awake", label: "Vaken", className: "bg-muted-foreground/30" },
] as const

const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} m` : `${m} m`)

function SleepForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: SleepLog
  onSave: (hours: number, quality?: number) => void
  onCancel?: () => void
}) {
  const [hours, setHours] = React.useState(initial?.hours ?? 7.5)
  const [quality, setQuality] = React.useState<number | undefined>(initial?.quality)
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" aria-label="Minska en halvtimme" onClick={() => setHours((h) => Math.max(0, h - 0.5))}>
          <Minus />
        </Button>
        <div className="flex-1 text-center">
          <div className="text-3xl font-semibold tabular" aria-live="polite">
            {hours.toLocaleString("sv-SE")} h
          </div>
          <div className="text-xs text-muted-foreground">timmar sömn</div>
        </div>
        <Button variant="outline" size="icon" aria-label="Öka en halvtimme" onClick={() => setHours((h) => Math.min(16, h + 0.5))}>
          <Plus />
        </Button>
      </div>
      <div className="grid grid-cols-5 gap-1" role="radiogroup" aria-label="Hur sov du?">
        {QUALITY.map((q, i) => (
          <button
            key={q}
            type="button"
            role="radio"
            aria-checked={quality === i + 1}
            onClick={() => setQuality(i + 1)}
            className={cn(
              "rounded-lg border px-1 py-2 text-xs transition-colors",
              quality === i + 1 ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
            )}
          >
            {q}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Avbryt
          </Button>
        )}
        <Button className="flex-1" onClick={() => onSave(hours, quality)}>
          Spara sömn
        </Button>
      </div>
    </div>
  )
}

/** Sju senaste nätterna som små staplar (tim­mar), med värdet i text under. */
function SleepWeek({ logs, today }: { logs: SleepLog[]; today: ISODate }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
  const max = 10
  return (
    <ol className="grid grid-cols-7 items-end gap-1.5" aria-label="Sömn senaste veckan">
      {days.map((d) => {
        const l = logs.find((x) => x.date === d)
        return (
          <li key={d} className="flex flex-col items-center gap-1" title={l ? `${formatShort(d)}: ${l.hours} h` : formatShort(d)}>
            <div className="flex h-12 w-full items-end rounded-md bg-muted">
              {l && <div className="w-full rounded-md bg-primary/70" style={{ height: `${Math.min(100, (l.hours / max) * 100)}%` }} />}
            </div>
            <span className="text-[10px] text-muted-foreground tabular">{l ? l.hours.toLocaleString("sv-SE") : "–"}</span>
          </li>
        )
      })}
    </ol>
  )
}

// =============================================================== wearables ===

const PROVIDERS: { id: WearableProvider; web: boolean; note: string }[] = [
  { id: "fitbit", web: true, note: "Sömn, sömnsteg och poäng synkas automatiskt." },
  { id: "apple_health", web: false, note: "Kräver Coavira-appen för iPhone (kommer). Data finns bara på telefonen." },
  { id: "google_fit", web: false, note: "Kräver Coavira-appen för Android (kommer) via Health Connect." },
]

export function WearablesCard() {
  const { data, me, mode, actions } = useAppData()
  const [busy, setBusy] = React.useState<string | null>(null)

  // Resultat från OAuth-flödet (?wearable=…) visas som en notis.
  React.useEffect(() => {
    const url = new URL(window.location.href)
    const status = url.searchParams.get("wearable")
    if (!status) return
    const messages: Record<string, () => void> = {
      ansluten: () => toast.success("Fitbit är ansluten och sömnen är synkad"),
      "ansluten-demo": () => toast.success("Ansluten (demo-enhet – inga Fitbit-nycklar konfigurerade än)"),
      nekad: () => toast("Anslutningen avbröts"),
      fel: () => toast.error("Anslutningen misslyckades. Försök igen."),
      "kraver-app": () => toast("Den här källan kräver mobilappen"),
    }
    messages[status]?.()
    url.searchParams.delete("wearable")
    window.history.replaceState(null, "", url)
  }, [])

  const refresh = async () => {
    const { reloadSleepAndWearables } = await import("@/lib/data/supabase-source")
    const fresh = await reloadSleepAndWearables(getSupabase())
    actions.applySleepSync(fresh.sleepLogs)
    actions.setWearables(fresh.wearables)
  }

  const demoSync = (provider: WearableProvider, days: number) => {
    const to = todayISO()
    const logs = mockSleepRange(addDays(to, -(days - 1)), to).map(
      (r): SleepLog => ({ clientId: me.id, date: r.date, hours: r.hours, stages: r.stages, sleepScore: r.sleepScore, source: "mock" })
    )
    actions.applySleepSync(logs)
    const now = new Date().toISOString()
    const others = data.wearables.filter((w) => w.provider !== provider)
    actions.setWearables([...others, { provider, status: "active", connectedAt: now, lastSyncedAt: now }])
  }

  const connect = (provider: WearableProvider) => {
    if (mode === "demo") {
      demoSync(provider, 14)
      toast.success(`${PROVIDER_LABEL[provider]} ansluten (demo)`)
      return
    }
    // Full sidladdning: API-routen skickar vidare till leverantörens inloggning (extern sida).
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/api/wearables/${provider}/connect`)
  }

  const sync = async () => {
    setBusy("sync")
    try {
      if (mode === "demo") {
        data.wearables.forEach((w) => demoSync(w.provider, 7))
      } else {
        const res = await fetch("/api/wearables/sync", { method: "POST" })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Synk misslyckades")
        await refresh()
      }
      toast.success("Sömnen är synkad")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Synk misslyckades")
    } finally {
      setBusy(null)
    }
  }

  const disconnect = async (provider: WearableProvider) => {
    if (!window.confirm(`Koppla från ${PROVIDER_LABEL[provider]}? Redan synkad sömn ligger kvar.`)) return
    setBusy(provider)
    try {
      if (mode === "supabase") {
        const { error } = await getSupabase().from("wearable_connections").delete().eq("provider", provider)
        if (error) throw new Error(error.message)
      }
      actions.setWearables(data.wearables.filter((w) => w.provider !== provider))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte koppla från")
    } finally {
      setBusy(null)
    }
  }

  const connected = data.wearables.filter((w) => w.status !== "revoked")

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5" aria-labelledby="wearables-title">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="wearables-title" className="flex items-center gap-2 font-semibold">
            <Watch className="size-4 text-primary" /> Klocka och hälsoappar
          </h2>
          <p className="text-xs text-muted-foreground">Hämta sömn automatiskt i stället för att logga för hand.</p>
        </div>
        {connected.length > 0 && (
          <Button variant="outline" size="sm" onClick={sync} disabled={busy !== null}>
            <RefreshCw className={cn(busy === "sync" && "animate-spin")} /> Synka
          </Button>
        )}
      </div>
      <ul className="divide-y">
        {PROVIDERS.map((p) => {
          const conn = connected.find((c) => c.provider === p.id)
          return (
            <li key={p.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {PROVIDER_LABEL[p.id]}
                  {conn && (
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", conn.status === "error" ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary")}>
                      {conn.status === "error" ? "Fel" : "Ansluten"}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {conn?.lastSyncedAt ? `Senast synkad ${new Date(conn.lastSyncedAt).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}` : p.note}
                </p>
              </div>
              {conn ? (
                <Button variant="ghost" size="sm" onClick={() => disconnect(p.id)} disabled={busy !== null} aria-label={`Koppla från ${PROVIDER_LABEL[p.id]}`}>
                  <Unplug />
                </Button>
              ) : (
                <Button variant={p.web ? "secondary" : "ghost"} size="sm" disabled={!p.web} onClick={() => connect(p.id)}>
                  {p.web ? "Anslut" : "Kommer"}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

