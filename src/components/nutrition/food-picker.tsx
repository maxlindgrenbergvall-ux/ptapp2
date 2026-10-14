"use client"

import { ArrowLeft, Barcode, Clock, Globe, Loader2, PackagePlus, Search, Star, WifiOff } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { BarcodeScanner } from "@/components/nutrition/barcode-scanner"
import { MacroInline } from "@/components/nutrition/macros"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { searchLibrary, searchProducts, forGrams } from "@/lib/food-search"
import { cn } from "@/lib/utils"
import type { FoodEntry, FoodProduct } from "@/types/domain"

export type NewFoodEntry = Omit<FoodEntry, "id" | "clientId" | "date">

/**
 * Lägg till mat: sök (senaste, egna produkter, baslivsmedel, märkesvaror från
 * Open Food Facts) eller skanna streckkoden. Välj mängd och se makron direkt.
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
    const own = customFoods.find((p) => p.barcode === code) ?? recent.find((p) => p.barcode === code)
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

  if (lookup?.status === "missing" || lookup?.status === "error") {
    return (
      <CustomProductForm
        barcode={lookup.code}
        reason={lookup.status}
        onCancel={() => setLookup(null)}
        onSave={(p) => {
          onSaveCustom(p)
          setLookup(null)
          pick(p)
        }}
      />
    )
  }

  const showPanel = open && (q.length > 0 || recents.length > 0 || mine.length > 0)

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
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-[60vh] overflow-y-auto rounded-xl border bg-popover p-1 shadow-xl"
          onMouseDown={(e) => e.preventDefault()}
        >
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
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="size-3 animate-spin" /> Söker…
                  </span>
                ) : online.status === "error" ? (
                  <span className="flex items-center gap-1.5">
                    <WifiOff className="size-3" /> Kunde inte söka märkesvaror just nu
                  </span>
                ) : online.status === "done" && brands.length === 0 ? (
                  "Inga märkesvaror hittades"
                ) : null
              }
            />
          )}
          {q && library.length === 0 && mine.length === 0 && recents.length === 0 && q.length < 3 && (
            <p className="px-3 py-3 text-sm text-muted-foreground">Inga träffar. Skriv minst tre bokstäver för att söka märkesvaror.</p>
          )}
          <div className="flex items-center justify-between gap-2 border-t px-2 pt-1.5 pb-1 text-[11px] text-muted-foreground">
            <span>Märkesvaror: Open Food Facts (ODbL)</span>
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
            {p.brand && <span className="block truncate text-xs text-muted-foreground">{p.brand}</span>}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground tabular">{Math.round(p.per100.kcal)} kcal/100 g</span>
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

function PortionForm({ product, onAdd, onBack }: { product: FoodProduct; onAdd: (e: NewFoodEntry) => void; onBack: () => void }) {
  const [grams, setGrams] = React.useState(String(product.servingG ?? 100))
  const g = Math.max(0, Number(grams.replace(",", ".")) || 0)
  const macros = forGrams(product.per100, g)
  const chips = [
    ...(product.servingG ? [{ label: `1 portion (${product.servingG} g)`, value: product.servingG }] : []),
    ...[50, 100, 150, 200].filter((v) => v !== product.servingG).map((v) => ({ label: `${v} g`, value: v })),
  ].slice(0, 5)

  return (
    <form
      className="space-y-3 rounded-xl border bg-card p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (g <= 0 || g > 5000) return toast.error("Ange en mängd mellan 1 och 5000 g")
        onAdd({
          name: product.brand && !product.name.toLowerCase().includes(product.brand.toLowerCase()) ? `${product.name} (${product.brand})` : product.name,
          ...macros,
          grams: g,
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
            {[product.brand, product.barcode && `EAN ${product.barcode}`, `${Math.round(product.per100.kcal)} kcal/100 g`].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => setGrams(String(c.value))}
            aria-pressed={g === c.value}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              g === c.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
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
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            className="h-10 w-24 text-right text-lg font-semibold tabular"
            aria-label="Mängd i gram"
            autoFocus
          />
          <span className="text-sm text-muted-foreground">g</span>
        </div>
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
  barcode,
  reason,
  onSave,
  onCancel,
}: {
  barcode?: string
  reason: "missing" | "error"
  onSave: (p: FoodProduct) => void
  onCancel: () => void
}) {
  const [f, setF] = React.useState({ name: "", brand: "", kcal: "", protein: "", carbs: "", fat: "", serving: "" })
  const n = (v: string) => Math.max(0, Number(v.replace(",", ".")) || 0)
  return (
    <form
      className="space-y-3 rounded-xl border bg-card p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!f.name.trim()) return toast.error("Ange produktens namn")
        const per100 = { kcal: n(f.kcal), protein: Math.min(100, n(f.protein)), carbs: Math.min(100, n(f.carbs)), fat: Math.min(100, n(f.fat)) }
        if (per100.kcal <= 0 || per100.kcal > 1000) return toast.error("Ange energi per 100 g (står på förpackningen)")
        onSave({
          id: crypto.randomUUID(),
          name: f.name.trim().slice(0, 160),
          brand: f.brand.trim() || undefined,
          barcode,
          per100,
          servingG: n(f.serving) || undefined,
          source: "custom",
        })
      }}
    >
      <div className="flex items-start gap-2">
        <PackagePlus className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="text-sm">
          <div className="font-medium">{reason === "missing" ? "Produkten finns inte i databasen" : "Kunde inte hämta produkten just nu"}</div>
          <p className="text-xs text-muted-foreground">
            Lägg till den själv med värdena från förpackningen{barcode ? ` (EAN ${barcode})` : ""}. Nästa gång du skannar den hittas den direkt.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input className="col-span-2" placeholder="Namn, t.ex. Proteinbar choklad" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Namn" autoFocus />
        <Input placeholder="Varumärke (valfritt)" value={f.brand} onChange={(e) => setF({ ...f, brand: e.target.value })} aria-label="Varumärke" />
        <Input inputMode="decimal" placeholder="Portion i g (valfritt)" value={f.serving} onChange={(e) => setF({ ...f, serving: e.target.value })} aria-label="Portion i gram" />
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-xs text-muted-foreground">Per 100 g</legend>
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
