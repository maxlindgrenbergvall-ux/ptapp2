"use client"

import { ArrowLeft, Barcode, Clock, Globe, Loader2, PackagePlus, Plus, Search, Star, Tag, WifiOff } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { BarcodeScanner } from "@/components/nutrition/barcode-scanner"
import { MacroInline } from "@/components/nutrition/macros"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Label } from "@/components/ui/label"
import { forGrams, isValidBarcode, searchLibrary, searchProducts } from "@/lib/food-search"
import { POPULAR_BRANDS } from "@/lib/swedish-brands"
import { cn } from "@/lib/utils"
import { allowedUnits, densityOf, foodKind, KIND_UNITS, pieceWeight, VOLUME_ML } from "@/lib/nutrition/meal-items"
import { MEAL_UNIT_LABEL, type FoodEntry, type FoodProduct, type FoodUnit, type MealUnit } from "@/types/domain"

export type NewFoodEntry = Omit<FoodEntry, "id" | "clientId" | "date">

/**
 * Lägg till mat: sök (senaste, egna produkter, baslivsmedel, märkesvaror från
 * Open Food Facts – svenska varor först) eller skanna streckkoden. Välj mängd
 * (g eller ml för drycker) och se makron direkt. Saknas varan kan den läggas
 * till som egen produkt, som sparas och hittas nästa gång.
 */
export function FoodPicker({
  onAdd,
  recent,
  customFoods,
  onSaveCustom,
}: {
  onAdd: (entry: NewFoodEntry) => void
  /** Tidigare loggade produkter (med gram), senaste först. */
  recent: FoodProduct[]
  customFoods: FoodProduct[]
  onSaveCustom: (product: FoodProduct) => void
}) {
  const [query, setQuery] = React.useState("")
  const [open, setOpen] = React.useState(false)
  const [selected, setSelected] = React.useState<FoodProduct | null>(null)
  const [scanOpen, setScanOpen] = React.useState(false)
  const [lookup, setLookup] = React.useState<{ code: string; status: "loading" | "missing" | "error" } | null>(null)
  /** Lägg till egen produkt direkt från sökningen (namnet förifylls med frågan). */
  const [manual, setManual] = React.useState<string | null>(null)
  const online = useOnlineSearch(query)

  const q = query.trim()
  const mine = q ? searchProducts(q, customFoods, 5) : customFoods.slice(0, 5)
  const library = q ? searchLibrary(q, 8) : []
  const recents = q ? searchProducts(q, recent, 4) : recent.slice(0, 6)
  // Märkesvaror som redan finns bland egna/senaste visas inte två gånger.
  const known = new Set([...mine, ...recents].map((p) => p.barcode).filter(Boolean))
  const brands = online.products.filter((p) => !known.has(p.barcode))

  const pick = (p: FoodProduct) => {
    setSelected(p)
    setOpen(false)
    setQuery("")
  }

  const onScanned = async (code: string) => {
    // Samma vara kan ha skannats som EAN-13 eller UPC-A (12 siffror).
    const same = (b?: string) => !!b && (b === code || b.replace(/^0/, "") === code.replace(/^0/, ""))
    const own = customFoods.find((p) => same(p.barcode)) ?? recent.find((p) => same(p.barcode))
    if (own) return pick(own)
    setLookup({ code, status: "loading" })
    try {
      const res = await fetch(`/api/food/barcode/${code}`)
      if (res.ok) {
        setLookup(null)
        pick((await res.json()) as FoodProduct)
      } else {
        setLookup({ code, status: res.status === 404 ? "missing" : "error" })
      }
    } catch {
      setLookup({ code, status: "error" })
    }
  }

  if (selected) {
    return (
      <PortionForm
        product={selected}
        onBack={() => setSelected(null)}
        onAdd={(entry) => {
          onAdd(entry)
          setSelected(null)
          toast.success(`${selected.name} tillagd`)
        }}
      />
    )
  }

  if (lookup?.status === "missing" || lookup?.status === "error" || manual !== null) {
    return (
      <CustomProductForm
        barcode={lookup?.code}
        initialName={manual ?? ""}
        reason={manual !== null ? "manual" : (lookup!.status as "missing" | "error")}
        onCancel={() => {
          setLookup(null)
          setManual(null)
        }}
        onSave={(p) => {
          onSaveCustom(p)
          setLookup(null)
          setManual(null)
          pick(p)
          toast.success("Produkten är sparad", { description: "Den finns under Mina produkter nästa gång." })
        }}
      />
    )
  }

  const showPanel = open

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            role="combobox"
            aria-expanded={showPanel}
            aria-controls="food-picker-results"
            aria-label="Sök livsmedel eller märkesvara"
            placeholder="Sök livsmedel, t.ex. kvarg…"
            className="pl-8"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false)
              if (e.key === "Enter") {
                e.preventDefault()
                const first = recents[0] ?? mine[0] ?? library[0] ?? brands[0]
                if (q && first) pick(first)
              }
            }}
          />
        </div>
        <Button type="button" variant="secondary" onClick={() => setScanOpen(true)} disabled={lookup?.status === "loading"} aria-label="Skanna streckkod">
          {lookup?.status === "loading" ? <Loader2 className="animate-spin" /> : <Barcode />}
          <span className="hidden sm:inline">Skanna</span>
        </Button>
      </div>

      {showPanel && (
        <div
          id="food-picker-results"
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-[60vh] overflow-y-auto overscroll-contain rounded-xl border bg-popover p-1 shadow-xl"
          onMouseDown={(e) => e.preventDefault()}
        >
          {!q && (
            <div className="px-2.5 pt-1.5 pb-1">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                <Tag className="size-3" /> Populära varumärken
              </div>
              <div className="flex flex-wrap gap-1.5">
                {POPULAR_BRANDS.map((b) => (
                  <button
                    key={b.tag}
                    type="button"
                    onClick={() => setQuery(b.name)}
                    className="rounded-full border bg-background px-2.5 py-1 text-xs hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Group title="Senaste" icon={Clock} items={recents} onPick={pick} />
          <Group title="Mina produkter" icon={Star} items={mine} onPick={pick} />
          <Group title="Baslivsmedel" items={library} onPick={pick} />
          {q.length >= 3 && (
            <Group
              title="Märkesvaror"
              icon={Globe}
              items={brands}
              onPick={pick}
              status={
                online.status === "loading" ? (
                  <div className="-mx-2.5 space-y-1" aria-busy="true">
                    <span className="sr-only">Söker…</span>
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="flex items-center gap-3 px-2.5 py-1.5" aria-hidden>
                        <Skeleton className="size-8 shrink-0 rounded-md" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3 w-3/5" />
                          <Skeleton className="h-2.5 w-2/5" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : online.status === "error" ? (
                  <span className="flex items-center gap-1.5">
                    <WifiOff className="size-3" /> Kunde inte söka märkesvaror just nu
                  </span>
                ) : online.status === "done" && brands.length === 0 ? (
                  "Inga märkesvaror hittades – prova att skanna streckkoden eller lägg till varan själv."
                ) : null
              }
            />
          )}
          {q && library.length === 0 && mine.length === 0 && recents.length === 0 && q.length < 3 && (
            <p className="px-3 py-3 text-sm text-muted-foreground">Inga träffar. Skriv minst tre bokstäver för att söka märkesvaror.</p>
          )}
          <button
            type="button"
            onClick={() => setManual(q)}
            className="mt-1 flex w-full items-center gap-2 rounded-lg border-t px-2.5 py-2.5 text-left text-sm text-primary hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
          >
            <Plus className="size-4" /> Hittar du inte varan? Lägg till egen produkt
          </button>
          <div className="flex items-center justify-between gap-2 border-t px-2 pt-1.5 pb-1 text-[11px] text-muted-foreground">
            <span>Märkesvaror: Open Food Facts (ODbL), svenska varor först</span>
            <button type="button" className="underline-offset-4 hover:underline" onClick={() => setOpen(false)}>
              Stäng
            </button>
          </div>
        </div>
      )}

      <BarcodeScanner open={scanOpen} onOpenChange={setScanOpen} onDetected={onScanned} />
    </div>
  )
}

function Group({
  title,
  icon: Icon,
  items,
  onPick,
  status,
}: {
  title: string
  icon?: React.ComponentType<{ className?: string }>
  items: FoodProduct[]
  onPick: (p: FoodProduct) => void
  status?: React.ReactNode
}) {
  if (items.length === 0 && !status) return null
  return (
    <div className="py-1" role="group" aria-label={title}>
      <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {Icon && <Icon className="size-3" />} {title}
      </div>
      {items.map((p) => (
        <button
          key={p.id}
          type="button"
          role="option"
          aria-selected={false}
          onClick={() => onPick(p)}
          className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none"
        >
          {p.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- extern produktbild från OFF
            <img src={p.imageUrl} alt="" className="size-8 shrink-0 rounded-md bg-white object-contain" loading="lazy" />
          ) : (
            <span aria-hidden className="size-8 shrink-0 rounded-md bg-muted" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate">{p.name}</span>
            {(p.brand || p.servingG) && (
              <span className="block truncate text-xs text-muted-foreground">
                {[p.brand, p.servingG && `${p.servingG} ${p.unit ?? "g"}`].filter(Boolean).join(" · ")}
              </span>
            )}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground tabular">
            {Math.round(p.per100.kcal)} kcal/100 {p.unit ?? "g"}
          </span>
        </button>
      ))}
      {status && <div className="px-2.5 py-1.5 text-xs text-muted-foreground">{status}</div>}
    </div>
  )
}

/** Debouncad sökning mot /api/food/search (Open Food Facts), med enkel cache per fråga. */
const cache = new Map<string, FoodProduct[]>()
function useOnlineSearch(query: string) {
  const q = query.trim().toLowerCase()
  const [state, setState] = React.useState<{ q: string; status: "idle" | "loading" | "done" | "error"; products: FoodProduct[] }>({
    q: "",
    status: "idle",
    products: [],
  })
  React.useEffect(() => {
    if (q.length < 3 || cache.has(q)) return
    const ctrl = new AbortController()
    const t = window.setTimeout(async () => {
      setState({ q, status: "loading", products: [] })
      try {
        const res = await fetch(`/api/food/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        const body = (await res.json()) as { products?: FoodProduct[] }
        if (!res.ok) throw new Error()
        cache.set(q, body.products ?? [])
        setState({ q, status: "done", products: body.products ?? [] })
      } catch {
        if (!ctrl.signal.aborted) setState({ q, status: "error", products: [] })
      }
    }, 450)
    return () => {
      ctrl.abort()
      window.clearTimeout(t)
    }
  }, [q])
  if (q.length < 3) return { status: "idle" as const, products: [] }
  const hit = cache.get(q)
  if (hit) return { status: "done" as const, products: hit }
  return state.q === q ? state : { status: "loading" as const, products: [] }
}

// ------------------------------------------------------------------ portion ---

/** Snabbval för mängd per enhet: drycker i ml (burk 330, flaska 500), övrigt i gram eller mått. */
const AMOUNTS: Record<MealUnit, number[]> = {
  g: [50, 100, 150, 200],
  ml: [100, 250, 330, 500],
  dl: [1, 2, 3],
  st: [1, 2, 3],
  msk: [1, 2],
  tsk: [1, 2],
}

/**
 * Logiska enheter för en produkt – samma regler som i PT:ns kostbyggare
 * (allowedUnits): vätskor i ml/dl, ris/pasta/gryn i g/dl, ägg/frukt i st/g,
 * kött/fisk/fasta livsmedel bara i g. Produktens basenhet (g eller ml) först.
 */
function portionUnits(product: FoodProduct): MealUnit[] {
  const base: FoodUnit = product.unit ?? "g"
  const kind = foodKind(product.name)
  const logical = base === "ml" || kind === "liquid" ? KIND_UNITS.liquid : allowedUnits(product.name)
  return [base, ...logical.filter((u) => u !== base && !(base === "ml" && u === "g"))]
}

/** Mängd i vald enhet → mängd i produktens basenhet (g eller ml). */
function toBase(product: FoodProduct, unit: MealUnit, amount: number): number {
  const base: FoodUnit = product.unit ?? "g"
  const density = densityOf(product.name)
  if (unit === base) return amount
  if (unit === "g") return amount / density // bas ml
  if (unit === "st") {
    const g = amount * (pieceWeight(product.name, product.servingG) ?? 100)
    return base === "ml" ? g / density : g
  }
  const ml = amount * VOLUME_ML[unit]
  return base === "ml" ? ml : ml * density
}

const roundFor = (unit: MealUnit, n: number) => (unit === "g" || unit === "ml" ? Math.round(n) : Math.max(0.25, Math.round(n * 4) / 4))

function PortionForm({ product, onAdd, onBack }: { product: FoodProduct; onAdd: (e: NewFoodEntry) => void; onBack: () => void }) {
  const base: FoodUnit = product.unit ?? "g"
  const units = portionUnits(product)
  const [unit, setUnit] = React.useState<MealUnit>(units[0])
  const [amount, setAmount] = React.useState(String(product.servingG ?? (base === "ml" ? 330 : 100)))
  const a = Math.max(0, Number(amount.replace(",", ".")) || 0)
  // Allt sparas i produktens basenhet (gram, eller ml för drycker).
  const g = Math.round(toBase(product, unit, a))
  const macros = forGrams(product.per100, g)
  const chips = [
    ...(product.servingG && unit === base
      ? [{ label: `1 ${base === "ml" ? "förpackning" : "portion"} (${product.servingG} ${base})`, value: product.servingG }]
      : []),
    ...AMOUNTS[unit].filter((v) => unit !== base || v !== product.servingG).map((v) => ({ label: `${v.toLocaleString("sv-SE")} ${MEAL_UNIT_LABEL[unit]}`, value: v })),
  ].slice(0, 5)
  const switchTo = (u: MealUnit) => {
    // Behåll ungefär samma mängd i den nya enheten.
    const perUnit = toBase(product, u, 1)
    setAmount(String(roundFor(u, perUnit > 0 ? g / perUnit : 1)).replace(".", ","))
    setUnit(u)
  }

  return (
    <form
      className="space-y-3 rounded-2xl border border-border/70 bg-card shadow-card p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (g <= 0 || g > 5000) return toast.error(`Ange en mängd mellan 1 och 5000 ${base}`)
        onAdd({
          name: product.brand && !product.name.toLowerCase().includes(product.brand.toLowerCase()) ? `${product.name} (${product.brand})` : product.name,
          ...macros,
          grams: g,
          unit: base,
          barcode: product.barcode,
          productId: product.id,
        })
      }}
    >
      <div className="flex items-start gap-2">
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Tillbaka till sökningen" onClick={onBack}>
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{product.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {[product.brand, product.barcode && `EAN ${product.barcode}`, `${Math.round(product.per100.kcal)} kcal/100 ${base}`].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => setAmount(String(c.value).replace(".", ","))}
            aria-pressed={a === c.value}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              a === c.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-10 w-24 text-right text-lg font-semibold tabular"
            aria-label={unit === "ml" ? "Mängd i milliliter" : unit === "g" ? "Mängd i gram" : `Mängd i ${MEAL_UNIT_LABEL[unit]}`}
            autoFocus
          />
          {units.length > 1 ? (
            <div role="radiogroup" aria-label="Enhet" className="flex rounded-md bg-muted p-0.5">
              {units.map((u) => (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={unit === u}
                  onClick={() => switchTo(u)}
                  className={cn("rounded px-2 py-1 text-xs", unit === u ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
                >
                  {MEAL_UNIT_LABEL[u]}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">{unit}</span>
          )}
        </div>
        {unit !== base && <span className="text-xs text-muted-foreground tabular">≈{g} {base}</span>}
        <div className="min-w-0 flex-1 text-right">
          <div className="text-lg font-semibold tabular">{macros.kcal} kcal</div>
          <MacroInline value={macros} className="justify-end" />
        </div>
      </div>
      <Button type="submit" className="w-full">
        Lägg till
      </Button>
    </form>
  )
}

// ----------------------------------------------------------- egen produkt ---

function CustomProductForm({
  barcode: scanned,
  initialName = "",
  reason,
  onSave,
  onCancel,
}: {
  barcode?: string
  initialName?: string
  /** missing/error = efter skanning, manual = från sökningen. */
  reason: "missing" | "error" | "manual"
  onSave: (p: FoodProduct) => void
  onCancel: () => void
}) {
  const [f, setF] = React.useState({ name: initialName, brand: "", kcal: "", protein: "", carbs: "", fat: "", serving: "", ean: "" })
  const [unit, setUnit] = React.useState<FoodUnit>("g")
  const n = (v: string) => Math.max(0, Number(v.replace(",", ".")) || 0)
  return (
    <form
      className="space-y-3 rounded-2xl border border-border/70 bg-card shadow-card p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!f.name.trim()) return toast.error("Ange produktens namn")
        const per100 = { kcal: n(f.kcal), protein: Math.min(100, n(f.protein)), carbs: Math.min(100, n(f.carbs)), fat: Math.min(100, n(f.fat)) }
        if (per100.kcal < 0 || per100.kcal > 1000 || f.kcal.trim() === "") return toast.error(`Ange energi per 100 ${unit} (står på förpackningen)`)
        const ean = f.ean.replace(/\D/g, "")
        if (ean && !isValidBarcode(ean)) return toast.error("Streckkoden verkar inte stämma – kontrollera siffrorna eller lämna fältet tomt")
        onSave({
          id: crypto.randomUUID(),
          name: f.name.trim().slice(0, 160),
          brand: f.brand.trim() || undefined,
          barcode: scanned ?? (ean || undefined),
          per100,
          servingG: n(f.serving) || undefined,
          unit,
          source: "custom",
        })
      }}
    >
      <div className="flex items-start gap-2">
        <PackagePlus className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="text-sm">
          <div className="font-medium">
            {reason === "missing" ? "Produkten finns inte i databasen" : reason === "error" ? "Kunde inte hämta produkten just nu" : "Lägg till egen produkt"}
          </div>
          <p className="text-xs text-muted-foreground">
            Fyll i värdena från förpackningen{scanned ? ` (EAN ${scanned})` : ""}. Produkten sparas på ditt konto och hittas direkt nästa gång du söker eller skannar.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input className="col-span-2" placeholder="Namn, t.ex. Proteinbar choklad" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Namn" autoFocus />
        <Input placeholder="Varumärke (valfritt)" value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} aria-label="Varumärke" />
        <Input
          inputMode="decimal"
          placeholder={`Portion i ${unit} (valfritt)`}
          value={f.serving}
          onChange={(e) => setF({ ...f, serving: e.target.value })}
          aria-label={unit === "ml" ? "Portion i milliliter" : "Portion i gram"}
        />
        {!scanned && (
          <Input
            className="col-span-2"
            inputMode="numeric"
            placeholder="Streckkod (valfritt, siffrorna under strecken)"
            value={f.ean}
            onChange={(e) => setF({ ...f, ean: e.target.value })}
            aria-label="Streckkod"
          />
        )}
      </div>
      <div role="radiogroup" aria-label="Näringsvärden anges per" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm">
        {(
          [
            ["g", "Mat (per 100 g)"],
            ["ml", "Dryck (per 100 ml)"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={unit === value}
            onClick={() => setUnit(value)}
            className={cn("rounded-md py-1.5", unit === value ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
          >
            {label}
          </button>
        ))}
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-xs text-muted-foreground">Per 100 {unit}</legend>
        <div className="grid grid-cols-4 gap-2">
          {(
            [
              ["kcal", "kcal"],
              ["protein", "Protein"],
              ["carbs", "Kolh."],
              ["fat", "Fett"],
            ] as const
          ).map(([k, label]) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`cp-${k}`} className="text-[11px] text-muted-foreground">
                {label}
              </Label>
              <Input id={`cp-${k}`} inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            </div>
          ))}
        </div>
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Avbryt
        </Button>
        <Button type="submit">Spara produkt</Button>
      </div>
    </form>
  )
}
