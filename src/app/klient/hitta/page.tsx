"use client"

import { MapPin, Search, SlidersHorizontal, Wifi } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { BoostedBadge } from "@/components/boost/boost"
import { EmptyState, PersonAvatar, Rating, SpecialtyBadge } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { isBoosted } from "@/lib/boost"
import { formatSek } from "@/lib/money"
import { useNextSlots } from "@/lib/calendar/use-slots"
import { useAppData } from "@/lib/data/store"
import { formatSlot } from "@/lib/date"
import { categoriesInText, recordInterest } from "@/lib/offers/interests"
import { offersNutritionPlan } from "@/lib/services/recommend"
import { NutritionTag } from "@/components/client/trainer-profile"
import { cn } from "@/lib/utils"
import { offersRemote, SPECIALTIES, SPECIALTY_LABEL, type Specialty } from "@/types/domain"

const PRICE = {
  all: { label: "Alla priser", test: () => true },
  low: { label: "Under 700 kr", test: (p: number) => p < 700 },
  mid: { label: "700–900 kr", test: (p: number) => p >= 700 && p <= 900 },
  high: { label: "Över 900 kr", test: (p: number) => p > 900 },
} as const
type PriceKey = keyof typeof PRICE
type SortKey = "match" | "rating" | "price" | "available"

export default function DiscoverPage() {
  const { data, me } = useAppData()
  const [q, setQ] = React.useState("")
  const [selected, setSelected] = React.useState<Specialty[]>([])
  const [price, setPrice] = React.useState<PriceKey>("all")
  const [city, setCity] = React.useState("all")
  const [remoteOnly, setRemoteOnly] = React.useState(false)
  const [sort, setSort] = React.useState<SortKey>("match")
  // PT-utbud: vissa PT:er erbjuder bara träning, andra bara kost.
  const [offering, setOffering] = React.useState<"all" | "training" | "nutrition">("all")
  // Länk från kostlåset: /klient/hitta?inriktning=kost.
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get("inriktning") !== "kost") return
    const id = requestAnimationFrame(() => setOffering("nutrition"))
    return () => cancelAnimationFrame(id)
  }, [])

  const cities = [...new Set(data.trainers.filter((t) => t.isPublished && t.city).map((t) => t.city))].sort()
  const published = data.trainers.filter((t) => t.isPublished)
  // Nästa lediga tid per PT, räknad från tillgänglighet minus bokad tid.
  const nextSlots = useNextSlots(published.map((t) => t.id))

  const results = published
    .map((t) => {
      const nextSlot = nextSlots[t.id]
      // Matchning: andel valda inriktningar som PT:n har.
      const match = selected.length ? selected.filter((s) => t.specialties.includes(s)).length / selected.length : 1
      // Kostschema = PT:n har kryssat i "Kost" OCH säljer en aktiv kosttjänst.
      return { trainer: t, nextSlot, match, nutrition: offersNutritionPlan(data, t), boosted: isBoosted(t) }
    })
    .filter(({ trainer: t, match, nutrition }) => {
      const text = q.trim().toLowerCase()
      return (
        (selected.length === 0 || match > 0) &&
        PRICE[price].test(t.pricePerSession) &&
        (city === "all" || t.city === city) &&
        (!remoteOnly || offersRemote(t.coachingMode)) &&
        (offering === "all" || (offering === "training" ? t.offersTraining : nutrition)) &&
        (!text ||
          t.name.toLowerCase().includes(text) ||
          t.bio.toLowerCase().includes(text) ||
          t.specialties.some((s) => SPECIALTY_LABEL[s].toLowerCase().includes(text)))
      )
    })
    .sort((a, b) => {
      if (sort === "rating") return b.trainer.rating - a.trainer.rating
      if (sort === "price") return a.trainer.pricePerSession - b.trainer.pricePerSession
      if (sort === "available") return (a.nextSlot ?? "9").localeCompare(b.nextSlot ?? "9")
      // Standardsorteringen: utvalda PT:er (PT Boost) först bland dem som matchar.
      return Number(b.boosted) - Number(a.boosted) || b.match - a.match || b.trainer.rating - a.trainer.rating
    })
  const anyBoosted = sort === "match" && results.some((r) => r.boosted)

  const toggle = (s: Specialty) => {
    // Att aktivt välja en inriktning är den starkaste intressesignalen (sparas bara lokalt).
    if (!selected.includes(s)) recordInterest(me.id, [s], "filter")
    setSelected((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))
  }

  // Fritextsökning som nämner en kategori ("hyrox", "viktnedgång") räknas när användaren slutat skriva.
  React.useEffect(() => {
    const found = categoriesInText(q)
    if (found.length === 0) return
    const t = window.setTimeout(() => recordInterest(me.id, found, "search"), 1200)
    return () => window.clearTimeout(t)
  }, [q, me.id])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hitta din PT</h1>
        <p className="text-sm text-muted-foreground">Välj vad du vill träna mot så visar vi de som passar bäst.</p>
      </div>

      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök namn eller nyckelord" className="h-11 pl-9" aria-label="Sök PT" />
      </div>

      <div role="radiogroup" aria-label="Erbjuder" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {(
          [
            ["all", "Allt"],
            ["training", "Träning"],
            ["nutrition", "Kostschema"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={offering === value}
            onClick={() => setOffering(value)}
            className={cn("rounded-md py-1.5 text-sm", offering === value ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Inriktning">
        {SPECIALTIES.map((s) => (
          <button
            key={s}
            onClick={() => toggle(s)}
            aria-pressed={selected.includes(s)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              selected.includes(s) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
            )}
          >
            {SPECIALTY_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden />
        <Select value={price} onValueChange={(v) => setPrice(v as PriceKey)}>
          <SelectTrigger size="sm" aria-label="Pris">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PRICE).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={city} onValueChange={setCity}>
          <SelectTrigger size="sm" aria-label="Stad">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla städer</SelectItem>
            {cities.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          onClick={() => setRemoteOnly((r) => !r)}
          aria-pressed={remoteOnly}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors",
            remoteOnly ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
          )}
        >
          <Wifi className="size-3.5" /> Distans
        </button>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger size="sm" className="ml-auto" aria-label="Sortering">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="match">Bäst matchning</SelectItem>
            <SelectItem value="rating">Högst betyg</SelectItem>
            <SelectItem value="price">Lägst pris</SelectItem>
            <SelectItem value="available">Tidigast ledig</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {results.length} tränare
        {anyBoosted && <span className="block text-xs">Utvalda PT:er är betalda placeringar och visas först.</span>}
      </p>

      <ul className="space-y-3">
        {results.length === 0 && (
          <li>
            <EmptyState icon={Search} title="Ingen PT matchar" text="Prova att ta bort ett filter." />
          </li>
        )}
        {results.map(({ trainer: t, nextSlot, match, nutrition, boosted }) => (
          <li key={t.id}>
            <Link
              href={`/klient/hitta/${t.id}`}
              className={cn("block rounded-2xl border bg-card p-4 transition-colors hover:border-foreground/30", boosted && "border-brand/60 ring-1 ring-brand/30")}
            >
              <div className="flex gap-3">
                <PersonAvatar name={t.name} src={t.avatarUrl} className="size-12" />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <h2 className="truncate font-semibold">{t.name}</h2>
                        {boosted && <BoostedBadge className="shrink-0" />}
                      </div>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="size-3" /> {t.city}
                        {t.coachingMode !== "onsite" && ` · ${t.coachingMode === "remote" ? "Bara distans" : "Distans"}`} ·{" "}
                        {t.yearsExperience} års erfarenhet
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-semibold tabular">{formatSek(t.pricePerSession)}</div>
                      <div className="text-xs text-muted-foreground">per pass</div>
                    </div>
                  </div>
                  <Rating value={t.rating} count={t.reviews.length} />
                </div>
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{t.bio}</p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {nutrition && <NutritionTag />}
                {t.specialties.map((s) => (
                  <SpecialtyBadge key={s} specialty={s} />
                ))}
                {selected.length > 1 && match === 1 && <Badge className="bg-brand text-brand-foreground">Matchar alla</Badge>}
              </div>
              <p className="mt-3 text-xs">
                {nextSlot ? (
                  <>
                    <span className="text-muted-foreground">Nästa lediga tid:</span> <span className="font-medium">{formatSlot(nextSlot)}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Inga lediga tider just nu</span>
                )}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

