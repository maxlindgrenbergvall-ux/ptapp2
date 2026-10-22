"use client"

/**
 * "Vad vill du uppnå?" – en lekfull konfigurator: välj upp till tre mål ur
 * appens riktiga intressen (src/lib/interests.ts) så byggs Framsteg-vyn i
 * telefonen om direkt med mätpunkterna som hör till. Exempelvärdena räknas
 * fram ur mätpunktens nyckel (samma värden varje gång) – inga riktiga
 * användare eller siffror.
 *
 * Prestanda: ringen och omloppsbanan roterar med CSS (kompositorn, ingen
 * JavaScript per bildruta) och visas bara från md. Inga blur-filter – sken är
 * radiella gradienter. Scroll-parallaxen monteras bara från md.
 */
import {
  AnimatePresence,
  LayoutGroup,
  animate,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion"
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  ChartLine,
  Eye,
  Flame,
  House,
  MessageCircle,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Target,
  Ticket,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserRound,
  type LucideIcon,
} from "lucide-react"
import * as React from "react"

import { LINKS } from "@/components/landing/links"
import { StoreBadges } from "@/components/landing/store-badges"
import { EASE, FloatingBadge, GlassCard, GlowOrb, GradientText, GridBackdrop, PhoneFrame, Reveal, Section, useConfetti } from "@/components/landing/primitives"
import { INTERESTS, formatSeconds, metricsFor, type InterestDef, type MetricDef } from "@/lib/interests"
import { cn } from "@/lib/utils"
import { SPECIALTIES } from "@/types/domain"

/* ------------------------------------------------------------------ */
/* Inställningar och exempeldata                                       */
/* ------------------------------------------------------------------ */

const MAX_GOALS = 3
const DEFAULT_GOALS = ["styrkelyft", "cykling"]
const POINTS = 8
const SPRING = { type: "spring", stiffness: 520, damping: 30 } as const
const SOFT_SPRING = { type: "spring", stiffness: 260, damping: 28 } as const
const FOCUS_RING = "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"

/** Intressen som också är PT-inriktningar i Hitta PT (Simning och Rörlighet är det inte). */
const SPECIALTY_KEYS = new Set<string>(SPECIALTIES)

type Role = "client" | "pt"
const ROLES: { key: Role; label: string; icon: LucideIcon }[] = [
  { key: "client", label: "Jag är klient", icon: UserRound },
  { key: "pt", label: "Jag är PT", icon: BadgeCheck },
]

/** Vad som senast ändrades – styr svepet i telefonen och vart den rullar. */
type Pulse = { n: number; kind: "init" | "add" | "remove" | "clear" | "role"; focus: string | null }

/** Klientens "fokus" (fritext i appen) – ett exempel per intresse. */
const FOCUS: Record<string, string> = {
  styrkelyft: "200 kg i marklyft innan sommaren",
  cykling: "Under 17 minuter på milen till våren",
  lopning: "Springa milen under 45 minuter",
  hyrox: "Hyrox under 1:20 nästa säsong",
  viktminskning: "Ner 5 kg – och orka mer",
  bodybuilding: "Bygga muskler utan att tappa kondisen",
  kondition: "Orka mer i vardagen",
  simning: "100 m under 1:20",
  kalisthenics: "Första muscle-upen i år",
  rehab: "Smärtfri i löpspåret igen",
  rorlighet: "Nå golvet i framåtfällningen",
}

/** Påhittade PT:er för illustrationen. */
const PT_POOL = [
  { name: "Elin Söderberg", tone: "bg-brand/20 text-brand" },
  { name: "Jonas Ek", tone: "bg-emerald-400/20 text-emerald-300" },
  { name: "Amira Haddad", tone: "bg-sky-400/20 text-sky-300" },
  { name: "Viktor Lund", tone: "bg-amber-400/20 text-amber-300" },
  { name: "Maja Berg", tone: "bg-rose-400/20 text-rose-300" },
  { name: "Oskar Nyström", tone: "bg-violet-400/20 text-violet-300" },
  { name: "Linnea Holm", tone: "bg-teal-400/20 text-teal-300" },
  { name: "Sami Korhonen", tone: "bg-lime-400/20 text-lime-300" },
]

/** Exempelintervall per mätpunkt: senaste värde (lo–hi), förbättring över perioden och avrundning. */
type Range = { lo: number; hi: number; gain: readonly [number, number]; step: number }

const RANGES: Record<string, Range> = {
  e1rm_squat: { lo: 125, hi: 150, gain: [7.5, 15], step: 2.5 },
  e1rm_bench: { lo: 85, hi: 105, gain: [5, 10], step: 2.5 },
  e1rm_deadlift: { lo: 150, hi: 185, gain: [10, 20], step: 2.5 },
  cykling_10km: { lo: 1030, hi: 1140, gain: [40, 90], step: 1 },
  cykling_watt: { lo: 235, hi: 275, gain: [12, 25], step: 1 },
  cykling_ftp: { lo: 245, hi: 285, gain: [10, 22], step: 1 },
  cykling_langsta: { lo: 90, hi: 140, gain: [20, 40], step: 1 },
  lopning_5km: { lo: 1320, hi: 1500, gain: [45, 100], step: 1 },
  lopning_10km: { lo: 2760, hi: 3120, gain: [90, 200], step: 1 },
  lopning_vecka: { lo: 28, hi: 42, gain: [8, 15], step: 1 },
  hyrox_total: { lo: 4860, hi: 5400, gain: [180, 420], step: 1 },
  hyrox_ski: { lo: 235, hi: 265, gain: [8, 20], step: 1 },
  hyrox_wallballs: { lo: 35, hi: 55, gain: [8, 15], step: 1 },
  vikt: { lo: 74, hi: 86, gain: [3, 6], step: 0.1 },
  midja: { lo: 82, hi: 92, gain: [3, 6], step: 0.5 },
  vikt_bygg: { lo: 80, hi: 90, gain: [2, 4], step: 0.1 },
  arm: { lo: 37, hi: 41, gain: [1, 2], step: 0.5 },
  brost: { lo: 102, hi: 110, gain: [2, 4], step: 0.5 },
  vilopuls: { lo: 50, hi: 58, gain: [4, 8], step: 1 },
  vo2max: { lo: 46, hi: 54, gain: [2, 5], step: 1 },
  simning_100m: { lo: 82, hi: 98, gain: [3, 8], step: 1 },
  chins: { lo: 10, hi: 16, gain: [3, 6], step: 1 },
  plank: { lo: 120, hi: 210, gain: [30, 60], step: 1 },
  smarta: { lo: 1, hi: 3, gain: [2, 4], step: 1 },
  framatfallning: { lo: 4, hi: 12, gain: [4, 8], step: 0.5 },
}

/** Nya mätpunkter i INTERESTS får rimliga värden utan att något behöver läggas till här. */
const fallbackRange = (metric: MetricDef): Range =>
  metric.format === "time" ? { lo: 300, hi: 600, gain: [20, 40], step: 1 } : { lo: 20, hi: 60, gain: [4, 10], step: 1 }

/** FNV-1a: samma nyckel ger alltid samma tal. */
function hash(text: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Liten deterministisk talföljd (mulberry32) – ingen Math.random. */
function seeded(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Sample {
  series: number[]
  first: number
  latest: number
  best: number
}

/** Åtta mätningar som går åt rätt håll (lägre för tider och vilopuls), med lite brus. */
function sampleFor(metric: MetricDef): Sample {
  const next = seeded(hash(metric.key))
  const range = RANGES[metric.key] ?? fallbackRange(metric)
  const snap = (v: number) => Math.max(0, Math.round(v / range.step) * range.step)
  const latest = snap(range.lo + next() * (range.hi - range.lo))
  const gain = Math.max(range.step, snap(range.gain[0] + next() * (range.gain[1] - range.gain[0])))
  const first = snap(metric.lowerIsBetter ? latest + gain : latest - gain)
  const series = Array.from({ length: POINTS }, (_, i) => {
    if (i === 0) return first
    if (i === POINTS - 1) return latest
    const t = 1 - Math.pow(1 - i / (POINTS - 1), 1.6)
    return snap(first + (latest - first) * t + (next() - 0.5) * gain * 0.4)
  })
  const best = metric.lowerIsBetter ? Math.min(...series) : Math.max(...series)
  return { series, first, latest, best }
}

/** Räknas fram en gång när modulen laddas (rent och lika på server och klient). */
const SAMPLES = new Map(INTERESTS.flatMap((i) => i.metrics).map((m) => [m.key, sampleFor(m)] as const))
const sampleOf = (metric: MetricDef) => SAMPLES.get(metric.key) ?? sampleFor(metric)

/** Tre exempel-PT:er per inriktning, alltid samma. */
function examplePts(key: string) {
  const start = hash(key) % PT_POOL.length
  return [0, 3, 6].map((step) => PT_POOL[(start + step) % PT_POOL.length])
}

const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)

const shortName = (name: string) => {
  const [first, last] = name.split(" ")
  return last ? `${first} ${last[0]}.` : first
}

const num = (v: number) => v.toLocaleString("sv-SE", { maximumFractionDigits: 1 })

/** Värdet utan enhet (tider som m:ss / h:mm:ss, som i appen). */
const mainText = (metric: MetricDef, v: number) => (metric.format === "time" ? formatSeconds(v) : num(v))
const unitOf = (metric: MetricDef) => (metric.format === "time" ? "" : (metric.unit ?? ""))
/** Korta enheter (kg, W, km, cm, st) får plats i de små raderna, längre ("slag/min") hoppas över. */
const shortUnit = (metric: MetricDef) => {
  const unit = unitOf(metric)
  return unit && unit.length <= 2 ? ` ${unit}` : ""
}

const countText = (n: number) => (n === 0 ? "Inga mål valda" : n === 1 ? "1 mål valt" : `${n} mål valda`)

interface Group {
  interest: InterestDef
  metrics: MetricDef[]
}

/** Mätpunkterna grupperade per intresse i vald ordning – samma logik som appens MetricsGrid. */
function groupsFor(keys: string[]): Group[] {
  return metricsFor(keys).reduce<Group[]>((acc, { interest, metric }) => {
    const group = acc.find((g) => g.interest.key === interest.key)
    if (group) group.metrics.push(metric)
    else acc.push({ interest, metrics: [metric] })
    return acc
  }, [])
}

/** Från md (768 px). Falskt på servern och i första renderingen, så att HTML:en blir lika. */
const MD_QUERY = "(min-width: 768px)"
const subscribeMd = (onChange: () => void) => {
  const mq = window.matchMedia(MD_QUERY)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}
const useFromMd = () =>
  React.useSyncExternalStore(
    subscribeMd,
    () => window.matchMedia(MD_QUERY).matches,
    () => false
  )

/**
 * Startar en nyss monterad emojis motrotation (CSS) i takt med omloppsbanans rotation –
 * annars står emojin snett om den läggs till efter att banan börjat snurra. Körs en gång
 * vid montering, aldrig per bildruta.
 */
function syncSpin(el: HTMLElement | null) {
  if (!el || typeof el.getAnimations !== "function") return
  const lead = el.closest<HTMLElement>("[data-omlopp]")?.getAnimations()[0]
  const own = el.getAnimations()[0]
  if (own && lead && lead.startTime !== null) own.startTime = lead.startTime
}

/* ------------------------------------------------------------------ */
/* Sektionen                                                           */
/* ------------------------------------------------------------------ */

/** Målväljaren och utfallet till vänster, telefonen med Framsteg till höger (i mobilen: väljare, telefon, utfall). */
export function GoalShowcase() {
  const [selected, setSelected] = React.useState<string[]>(DEFAULT_GOALS)
  const [role, setRole] = React.useState<Role>("client")
  const [lastAdded, setLastAdded] = React.useState<string | null>(null)
  const [pulse, setPulse] = React.useState<Pulse>({ n: 0, kind: "init", focus: null })
  const [denied, setDenied] = React.useState(0)
  const [notice, setNotice] = React.useState("")
  const fire = useConfetti()

  const chosen = selected.flatMap((k) => INTERESTS.find((i) => i.key === k) ?? [])
  const groups = groupsFor(selected)
  // Det som lyfts fram (PT:er, personbästa): senast tillagda målet, annars det första.
  const spotKey = lastAdded && selected.includes(lastAdded) ? lastAdded : selected[0]
  const spot = chosen.find((i) => i.key === spotKey)
  const specialty = [spot, ...chosen].find((i): i is InterestDef => !!i && SPECIALTY_KEYS.has(i.key))

  const bump = (kind: Pulse["kind"], focus: string | null = null) => setPulse((p) => ({ n: p.n + 1, kind, focus }))

  const toggle = (interest: InterestDef, from: HTMLElement) => {
    if (selected.includes(interest.key)) {
      const next = selected.filter((k) => k !== interest.key)
      setSelected(next)
      bump("remove")
      setNotice(`${interest.label} borttaget. ${countText(next.length)}.`)
      return
    }
    if (selected.length >= MAX_GOALS) {
      setDenied((d) => d + 1)
      // Växlande hårt mellanslag: skärmläsare läser annars inte upp samma text två gånger.
      setNotice(`I demon väljer du högst ${MAX_GOALS} mål – i appen kan du välja fler. Avmarkera ett för att byta.${denied % 2 ? "\u00a0" : ""}`)
      return
    }
    const next = [...selected, interest.key]
    setSelected(next)
    setLastAdded(interest.key)
    bump("add", interest.key)
    const full = next.length === MAX_GOALS
    setNotice(`${interest.label} tillagt. Framsteg visar nu ${interest.metrics.map((m) => m.label).join(", ")}.${full ? " Tre mål valda – full pott!" : ""}`)
    if (full) void fire(from, { particles: 80, spread: 75 })
  }

  const clear = () => {
    setSelected([])
    bump("clear")
    setNotice("Alla mål borttagna.")
  }

  const changeRole = (next: Role) => {
    if (next === role) return
    setRole(next)
    bump("role")
    setNotice(next === "pt" ? "Visar Framsteg som PT: din klients mål och mätpunkter." : "Visar Framsteg som klient: dina mål och mätpunkter.")
  }

  return (
    <Section
      id="mal"
      className="isolate overflow-x-clip"
      eyebrow="Framsteg efter dina mål"
      title={
        <>
          Vad vill du <GradientText>uppnå?</GradientText>
        </>
      }
      intro="Välj mål – appen bygger din Framsteg-vy direkt."
    >
      <Backdrop />
      {/*
        Ordningen väljare → telefon → PT:er och CTA gör att telefonen hamnar direkt under målen i
        mobilen, så att man ser vyn byggas om när man trycker. På desktop ligger väljaren och
        utfallet i vänsterkolumnen och ser ut som ett kort, med telefonen bredvid.
      */}
      <div className="grid grid-cols-1 gap-4 sm:gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:grid-rows-[auto_1fr] lg:gap-x-10 lg:gap-y-0">
        <Reveal className="min-w-0 lg:col-start-1 lg:row-start-1">
          <GoalPicker role={role} selected={selected} denied={denied} onRole={changeRole} onToggle={toggle} onClear={clear} />
        </Reveal>
        <Reveal delay={0.15} className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
          <PhoneStage role={role} chosen={chosen} groups={groups} spot={spot} pulse={pulse} />
        </Reveal>
        {/* Tonar in så fort den syns – på desktop ser kortets nedre halva då aldrig avhuggen ut. */}
        <Reveal viewport={{ once: true }} className="min-w-0 lg:col-start-1 lg:row-start-2">
          <GoalOutcome role={role} specialty={specialty} />
        </Reveal>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {notice}
      </p>
    </Section>
  )
}

/** Rutnät och gröna glöd bakom sektionen. */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <GridBackdrop className="opacity-70 [mask-image:radial-gradient(ellipse_55%_45%_at_70%_55%,black_10%,transparent_75%)]" />
      <GlowOrb className="top-[30%] right-[-12%] size-[36rem] bg-brand/[0.12]" />
      <GlowOrb className="top-[55%] left-[-14%] size-[30rem] bg-emerald-500/10" />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Konfiguratorn                                                       */
/* ------------------------------------------------------------------ */

/**
 * Övre delen: perspektiv, räknare och målen. I mobilen ligger målen på en rad som
 * sveps i sidled, så att telefonen under syns medan man väljer.
 */
function GoalPicker({
  role,
  selected,
  denied,
  onRole,
  onToggle,
  onClear,
}: {
  role: Role
  selected: string[]
  denied: number
  onRole: (role: Role) => void
  onToggle: (interest: InterestDef, from: HTMLElement) => void
  onClear: () => void
}) {
  const n = selected.length
  const full = n >= MAX_GOALS
  const groupRef = React.useRef<HTMLDivElement>(null)
  // "Rensa" försvinner när inget är valt – flytta fokus till första målet så att tangentbordet inte tappar platsen.
  const clear = () => {
    groupRef.current?.querySelector<HTMLButtonElement>("button")?.focus()
    onClear()
  }
  return (
    <GlassCard className="rounded-[2rem] p-4 sm:p-7 lg:rounded-b-none lg:border-b-0 lg:pb-6">
      <div aria-hidden className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-brand/60 to-transparent" />
      {/* Sken som gradient i stället för blur-filter. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-32 size-80 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brand)_16%,transparent),transparent)]"
      />

      <RoleToggle role={role} onChange={onRole} />

      {/* Mobil: rubrik och räknare på samma rad. */}
      <div className="mt-5 flex items-end justify-between gap-x-4 gap-y-4 sm:mt-7 sm:flex-wrap sm:gap-x-6">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.14em] text-brand uppercase">Testa: välj upp till {MAX_GOALS} mål</p>
          <h3 id="mal-val-titel" className="mt-1.5 text-2xl leading-tight font-bold tracking-tight sm:mt-2 sm:text-3xl">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={role}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="block"
              >
                {role === "pt" ? "Vad tränar din klient för?" : "Vad tränar du för?"}
              </motion.span>
            </AnimatePresence>
          </h3>
        </div>
        <GoalCounter n={n} denied={denied} />
      </div>

      <p className="mt-2 text-sm text-pretty text-muted-foreground sm:mt-3">
        {role === "pt" ? "Klientens mål styr vad du ser i Progress." : "Ändra dina mål när du vill i profilen."}
      </p>

      {/* Under sm: en svepbar rad ända ut till kortets kanter. Luft upptill och nedtill för ordningssiffran och fokusringen. */}
      <div
        ref={groupRef}
        role="group"
        aria-labelledby="mal-val-titel"
        className="-mx-4 mt-1.5 flex snap-x scroll-px-4 gap-2.5 overflow-x-auto px-4 pt-2.5 pb-2 [scrollbar-width:none] sm:mx-0 sm:mt-5 sm:flex-wrap sm:overflow-visible sm:p-0 [&::-webkit-scrollbar]:hidden"
      >
        {INTERESTS.map((interest) => {
          const order = selected.indexOf(interest.key) + 1
          return <GoalChip key={interest.key} interest={interest} order={order} locked={full && order === 0} onToggle={onToggle} />
        })}
      </div>

      <div className="mt-1 flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2 sm:mt-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={Math.min(n, MAX_GOALS)}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.25, ease: EASE }}
            className={cn("text-sm font-medium", full ? "text-brand" : "text-muted-foreground")}
          >
            {n === 0 && "Börja med det du tränar mest för."}
            {n === 1 && "Snyggt! Två till får plats."}
            {n === 2 && "Ett mål kvar – kör!"}
            {full && "Full pott! 🎉 Tryck på ett mål för att byta."}
          </motion.p>
        </AnimatePresence>
        {n > 0 && (
          <button
            type="button"
            onClick={clear}
            className={cn("inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground", FOCUS_RING)}
          >
            <RotateCcw aria-hidden className="size-4" />
            Rensa
          </button>
        )}
      </div>
    </GlassCard>
  )
}

/**
 * Nedre delen: matchande PT:er (eller räckvidd för PT:n) och CTA. På desktop sitter den
 * ihop med GoalPicker som ett kort; i mobilen är den ett eget kort under telefonen.
 */
function GoalOutcome({ role, specialty }: { role: Role; specialty?: InterestDef }) {
  return (
    <GlassCard className="rounded-[2rem] p-4 sm:p-7 lg:h-full lg:rounded-t-none lg:border-t-0 lg:pt-0 lg:shadow-none">
      <div aria-hidden className="mb-6 hidden h-px bg-gradient-to-r from-white/[0.02] via-white/10 to-white/[0.02] lg:block" />

      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={`${role}-${specialty?.key ?? "alla"}`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12, transition: { duration: 0.2 } }}
          transition={{ duration: 0.4, ease: EASE }}
          className="min-h-[4.5rem] sm:min-h-[8.5rem]"
        >
          {role === "pt" ? <PtReach specialty={specialty} /> : <PtMatches specialty={specialty} />}
        </motion.div>
      </AnimatePresence>

      <GoalCta role={role} />
    </GlassCard>
  )
}

/** "Jag är klient / Jag är PT" med en glidande markering. */
function RoleToggle({ role, onChange }: { role: Role; onChange: (role: Role) => void }) {
  return (
    <div role="group" aria-label="Välj perspektiv" className="grid w-full grid-cols-2 rounded-full border border-white/10 bg-black/20 p-1 sm:inline-grid sm:w-auto">
      {ROLES.map(({ key, label, icon: Icon }) => {
        const on = role === key
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(key)}
            className={cn(
              "relative inline-flex h-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold transition-colors sm:px-5",
              FOCUS_RING,
              on ? "text-brand-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {on && <motion.span aria-hidden layoutId="mal-roll-markering" transition={SPRING} className="absolute inset-0 rounded-full bg-brand shadow-[0_0_24px_-6px] shadow-brand/70" />}
            <Icon aria-hidden className="relative hidden size-4 sm:block" />
            <span className="relative">{label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Stor räknare "2/3" med mätare. Skakar till när man försöker välja ett fjärde mål. */
function GoalCounter({ n, denied }: { n: number; denied: number }) {
  return (
    <motion.div
      key={denied}
      animate={denied ? { x: [0, -9, 9, -6, 6, -2, 0] } : undefined}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="flex shrink-0 flex-col items-end gap-1.5 sm:gap-2"
    >
      <span className="sr-only">
        {n} av {MAX_GOALS} mål valda
      </span>
      <div aria-hidden className="flex items-end gap-2">
        <span className="flex items-baseline">
          <span className="relative inline-flex h-10 items-center overflow-hidden text-4xl leading-none font-extrabold tracking-tight text-brand tabular-nums sm:h-12 sm:text-5xl">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={n} initial={{ y: "100%", opacity: 0 }} animate={{ y: "0%", opacity: 1 }} exit={{ y: "-100%", opacity: 0 }} transition={SPRING}>
                {n}
              </motion.span>
            </AnimatePresence>
          </span>
          <span className="text-xl font-bold text-muted-foreground sm:text-2xl">/{MAX_GOALS}</span>
        </span>
        <span className="pb-1 text-xs leading-tight font-medium text-muted-foreground">
          mål
          <br />
          {n === 1 ? "valt" : "valda"}
        </span>
      </div>
      <div aria-hidden className="flex gap-1.5">
        {Array.from({ length: MAX_GOALS }, (_, i) => (
          <span key={i} className="h-1.5 w-7 overflow-hidden rounded-full bg-white/10 sm:w-9">
            <motion.span initial={false} animate={{ scaleX: i < n ? 1 : 0 }} transition={SOFT_SPRING} className="block h-full origin-left rounded-full bg-gradient-to-r from-emerald-400 to-brand" />
          </span>
        ))}
      </div>
    </motion.div>
  )
}

/** Ett mål att slå på/av. Studsar vid tryck, emojin poppar och ordningsnumret fjädrar in. */
function GoalChip({
  interest,
  order,
  locked,
  onToggle,
}: {
  interest: InterestDef
  order: number
  locked: boolean
  onToggle: (interest: InterestDef, from: HTMLElement) => void
}) {
  const on = order > 0
  return (
    <motion.button
      type="button"
      aria-pressed={on}
      aria-disabled={locked || undefined}
      onClick={(e) => onToggle(interest, e.currentTarget)}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.93 }}
      transition={SPRING}
      className={cn(
        "relative inline-flex h-12 shrink-0 snap-start items-center gap-2.5 rounded-2xl border pr-4 pl-1.5 text-sm font-semibold transition-[background-color,border-color,color,box-shadow,opacity] duration-300 sm:text-[15px]",
        FOCUS_RING,
        on
          ? "border-brand/60 bg-brand/[0.12] text-foreground shadow-[0_0_28px_-10px] shadow-brand/70"
          : "border-white/10 bg-white/[0.03] text-foreground/85 hover:border-white/20 hover:bg-white/[0.06] hover:text-foreground",
        locked && "opacity-45"
      )}
    >
      <motion.span
        aria-hidden
        initial={false}
        animate={on ? { scale: [1, 1.38, 1], rotate: [0, -14, 0] } : { scale: 1, rotate: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
        className={cn("grid size-9 shrink-0 place-items-center rounded-xl text-lg transition-colors duration-300", on ? "bg-brand/20" : "bg-white/[0.06]")}
      >
        {interest.emoji}
      </motion.span>
      {interest.label}
      <AnimatePresence initial={false}>
        {on && (
          <motion.span
            key="ordning"
            aria-hidden
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, rotate: 45 }}
            transition={SPRING}
            className="absolute -top-2 -right-2 grid size-5 place-items-center rounded-full bg-brand text-[11px] font-bold text-brand-foreground tabular-nums shadow-md shadow-black/40"
          >
            {order}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

/** Klient: PT:er inom målets inriktning (exempel) – så fungerar Hitta PT. */
function PtMatches({ specialty }: { specialty?: InterestDef }) {
  if (!specialty) {
    return (
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Search aria-hidden className="size-4 text-brand" /> Hitta en PT som passar dig
        </p>
        <p className="mt-2 text-sm text-pretty text-muted-foreground">Filtrera på inriktning, pris, stad och distans. Alla PT:er granskas manuellt.</p>
      </div>
    )
  }
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          Matchande PT:er inom{" "}
          <span className="whitespace-nowrap text-brand">
            <span aria-hidden>{specialty.emoji}</span> {specialty.label}
          </span>
        </p>
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-muted-foreground">Exempel</span>
      </div>
      {/* Mobil: två exempel-PT:er på en rad i stället för tre på två. */}
      <ul className="mt-3 flex flex-wrap gap-2">
        {examplePts(specialty.key).map((pt, i) => (
          <motion.li
            key={pt.name}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...SOFT_SPRING, delay: 0.05 + i * 0.06 }}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] pr-3 pl-1 text-[13px] font-medium",
              i > 1 && "hidden sm:inline-flex"
            )}
          >
            <span aria-hidden className={cn("grid size-7 place-items-center rounded-full text-[10px] font-bold", pt.tone)}>
              {initials(pt.name)}
            </span>
            {shortName(pt.name)}
            <BadgeCheck aria-hidden className="size-3.5 text-brand" />
            <span className="sr-only">, verifierad PT</span>
          </motion.li>
        ))}
      </ul>
      <p className="mt-3 hidden text-sm text-pretty text-muted-foreground md:block">Filtrera på inriktning i Hitta PT. Alla PT:er granskas manuellt.</p>
    </div>
  )
}

/** PT: så hittar klienter med samma mål till dig. */
function PtReach({ specialty }: { specialty?: InterestDef }) {
  const label = specialty?.label
  const rows: { icon: LucideIcon; text: React.ReactNode }[] = [
    {
      icon: Search,
      text: label ? (
        <>
          Klienter som filtrerar på <span className="font-medium text-foreground">{label}</span> i Hitta PT hittar dig.
        </>
      ) : (
        "Klienter filtrerar på inriktning i Hitta PT."
      ),
    },
    { icon: Sparkles, text: "Egna erbjudanden per inriktning." },
    { icon: ChartLine, text: "Klientens mätpunkter i fliken Progress." },
  ]
  return (
    <div>
      <p className="text-sm font-semibold">
        {specialty ? (
          <>
            Syns för klienter inom{" "}
            <span className="whitespace-nowrap text-brand">
              <span aria-hidden>{specialty.emoji}</span> {specialty.label}
            </span>
          </>
        ) : (
          "Syns för rätt klienter"
        )}
      </p>
      <ul className="mt-2.5 space-y-1.5 sm:mt-3 sm:space-y-2">
        {rows.map(({ icon: Icon, text }, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, ease: EASE, delay: 0.05 + i * 0.06 }}
            className="flex items-start gap-2.5 text-sm text-muted-foreground"
          >
            <span aria-hidden className="mt-px grid size-5 shrink-0 place-items-center rounded-md bg-brand/15 text-brand">
              <Icon className="size-3" />
            </span>
            <span className="min-w-0">{text}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  )
}

/** Ladda ned appen (klient) eller ansök (PT). */
function GoalCta({ role }: { role: Role }) {
  return (
    <div className="mt-4 sm:mt-6">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={role}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: EASE }}
          className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5"
        >
          {role === "pt" ? (
            <a
              href={LINKS.ptApply}
              className={cn(
                "group relative inline-flex h-14 w-full shrink-0 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-7 text-base font-semibold transition-[background-color,border-color,translate] duration-300 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.1] sm:w-auto",
                FOCUS_RING
              )}
            >
              <BadgeCheck aria-hidden className="size-5 text-brand" />
              Ansök som PT
              <span className="sr-only"> (via e-post)</span>
              <ArrowRight aria-hidden className="size-5 transition-transform duration-300 group-hover:translate-x-1" />
            </a>
          ) : (
            <StoreBadges align="center" className="shrink-0 sm:justify-start" />
          )}
          <p className="text-sm text-pretty text-muted-foreground">
            {role === "pt" ? "Vi granskar ditt certifikat och skapar kontot. Du sätter dina priser." : "Gratis att ladda ned för iPhone och Android."}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Telefonen: scen, sken, omloppsbana och flytande brickor             */
/* ------------------------------------------------------------------ */

/** Banans och emojins rotation – samma längd, så att motrotationen tar ut banans exakt. */
const ORBIT_SPIN = "animate-[spin_40s_linear_infinite]"
const ORBIT_COUNTER_SPIN = "animate-[spin_40s_linear_infinite_reverse]"

function PhoneStage({ role, chosen, groups, spot, pulse }: { role: Role; chosen: InterestDef[]; groups: Group[]; spot?: InterestDef; pulse: Pulse }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const reduce = !!useReducedMotion()
  const fromMd = useFromMd()
  // Ringen snurrar bara när telefonen är nära skärmen. Marginalen gör att omstarten aldrig syns.
  const near = useInView(ref, { margin: "200px 0px" })
  const seen = useInView(ref, { once: true, margin: "0px 0px -20% 0px" })

  // Pekaren lutar telefonen (bara mus, inte med "minska rörelse").
  const px = useMotionValue(0)
  const py = useMotionValue(0)
  const sx = useSpring(px, { stiffness: 90, damping: 18, mass: 0.8 })
  const sy = useSpring(py, { stiffness: 90, damping: 18, mass: 0.8 })
  const rotateY = useTransform(sx, (v) => -6 + v * 14)
  const rotateX = useTransform(sy, (v) => 3 - v * 10)

  // Parallax (ScrollDrift, bara från md). 0 annars, så att serverns HTML och klientens första rendering är lika.
  const phoneY = useMotionValue(0)
  const badgesY = useMotionValue(0)

  return (
    <>
      <div
        ref={ref}
        id="mal-telefon"
        className="relative mx-auto w-full max-w-[600px] scroll-mt-24"
        onPointerMove={(e) => {
          if (reduce || e.pointerType !== "mouse") return
          const r = e.currentTarget.getBoundingClientRect()
          px.set((e.clientX - r.left) / r.width - 0.5)
          py.set((e.clientY - r.top) / r.height - 0.5)
        }}
        onPointerLeave={() => {
          px.set(0)
          py.set(0)
        }}
      >
        <div className="mb-2 hidden justify-center md:flex">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-muted-foreground md:backdrop-blur-md">
            <span aria-hidden className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand/70 motion-reduce:animate-none" />
              <span className="relative size-2 rounded-full bg-brand" />
            </span>
            Live-förhandsvisning · {role === "pt" ? "PT-vy" : "klientvy"}
          </span>
        </div>

        <div className="relative flex justify-center py-1 sm:py-6 md:py-8">
          <Halo spin={near && !reduce} chosen={chosen} reduce={reduce} />
          {/* Mobil: ett mjukt sken bakom telefonen i stället för ringen (gradient, inget blur-filter). */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-1/2 h-80 -translate-y-1/2 bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brand)_20%,transparent),transparent)] md:hidden"
          />
          {/* Skugga under telefonen. */}
          <div aria-hidden className="pointer-events-none absolute bottom-0 left-1/2 h-20 w-72 -translate-x-1/2 bg-[radial-gradient(closest-side,rgba(0,0,0,0.7),transparent)]" />

          <motion.div style={{ y: phoneY }} className="relative z-10">
            <motion.div style={{ rotateX, rotateY, transformPerspective: 1400 }}>
              <PhoneFrame time="07:42">
                <FramstegScreen role={role} chosen={chosen} groups={groups} pulse={pulse} run={seen} reduce={reduce} />
              </PhoneFrame>
            </motion.div>
          </motion.div>

          {/*
            Flytande brickor (dekor – samma fakta står i texten bredvid, och de visas bara från md).
            En rad var och placerade vid telefonens övre och nedre ram, så att de aldrig täcker
            mätpunkterna eller rubrikerna.
          */}
          <motion.div aria-hidden style={{ y: badgesY }} className="pointer-events-none absolute inset-0 z-20 hidden md:block lg:hidden xl:block">
            {spot && (
              <FloatingBadge className="top-3 -right-4" delay={0.4}>
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand text-brand-foreground">
                  <Trophy className="size-4" />
                </span>
                <span className="text-[13px] font-semibold whitespace-nowrap">Personbästa!</span>
                <span className="relative -ml-1 grid place-items-center">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={spot.key}
                      initial={{ scale: 0, rotate: -30 }}
                      animate={{ scale: 1, rotate: 0 }}
                      exit={{ scale: 0, rotate: 30 }}
                      transition={SPRING}
                      className="block text-base leading-none"
                    >
                      {spot.emoji}
                    </motion.span>
                  </AnimatePresence>
                </span>
              </FloatingBadge>
            )}
            <FloatingBadge className="-bottom-1 -left-4" delay={0.7} distance={8}>
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300">
                {role === "pt" ? <Target className="size-4" /> : <Eye className="size-4" />}
              </span>
              <span className="text-[13px] font-semibold whitespace-nowrap">{role === "pt" ? "Dina klienters mål 🎯" : "Syns för din PT 👀"}</span>
            </FloatingBadge>
          </motion.div>
        </div>

        <p className="mx-auto mt-1 max-w-sm text-center text-xs text-pretty text-muted-foreground md:mt-2">
          Exempeldata.
          <span className="hidden md:inline">
            {" "}
            Mätpunkter märkta <span className="font-semibold text-brand">Auto</span> räknas fram ur pass- och viktloggen, resten loggar du själv.
          </span>
        </p>
      </div>
      {/* Syskon efter telefonen: då är ref:en satt när useScroll startar. */}
      {fromMd && !reduce && <ScrollDrift target={ref} phoneY={phoneY} badgesY={badgesY} />}
    </>
  )
}

/**
 * Scroll-parallax: brickorna rör sig lite mer än telefonen men följer med den, så att de inte
 * glider in över innehållet. Monteras bara från md och utan "minska rörelse" – på telefoner
 * körs ingen scrollmätning alls.
 */
function ScrollDrift({ target, phoneY, badgesY }: { target: React.RefObject<HTMLDivElement | null>; phoneY: MotionValue<number>; badgesY: MotionValue<number> }) {
  const { scrollYProgress } = useScroll({ target, offset: ["start end", "end start"] })
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    phoneY.set(v * -60)
    badgesY.set(v * -70)
  })
  // Tillbaka till 0 om fönstret krymper under md.
  React.useEffect(
    () => () => {
      phoneY.set(0)
      badgesY.set(0)
    },
    [phoneY, badgesY]
  )
  return null
}

/**
 * Glöd, en roterande ljusring och de valda målens emojis i omloppsbana runt telefonen. Bara
 * från md, och rotationen är ren CSS (kompositorn) – ingen JavaScript per bildruta.
 */
function Halo({ spin, chosen, reduce }: { spin: boolean; chosen: InterestDef[]; reduce: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 hidden aspect-square w-[min(30rem,calc(100%_-_3.5rem))] -translate-x-1/2 -translate-y-1/2 md:block">
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(closest-side,rgba(172,237,55,0.17),transparent_76%)]" />
      <div
        className={cn(
          "absolute inset-0 rounded-full opacity-80 [background:conic-gradient(from_0deg,transparent_0deg,var(--brand)_60deg,transparent_140deg,#34d399_220deg,transparent_310deg)] [mask-image:radial-gradient(closest-side,transparent_calc(100%_-_2px),black_calc(100%_-_1px))]",
          spin && "animate-[spin_24s_linear_infinite] motion-reduce:animate-none"
        )}
      />
      <div className="absolute inset-[13%] rounded-full border border-dashed border-white/[0.07]" />
      <div data-omlopp className={cn("absolute inset-0", spin && ORBIT_SPIN)}>
        <AnimatePresence>
          {chosen.map((interest, i) => (
            <Orbiter key={interest.key} emoji={interest.emoji} angle={55 + (i * 360) / chosen.length} spin={spin} reduce={reduce} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

/**
 * En emoji på ringen. Glider till sin nya plats när mål läggs till eller tas bort och står
 * alltid upprätt: banans CSS-rotation tas ut av samma rotation baklänges (i takt via syncSpin),
 * platsens vinkel av en motrotation som bara rör sig medan emojin byter plats.
 */
function Orbiter({ emoji, angle, spin, reduce }: { emoji: string; angle: number; spin: boolean; reduce: boolean }) {
  const theta = useSpring(angle, { stiffness: 110, damping: 18 })
  React.useEffect(() => {
    if (reduce) theta.jump(angle)
    else theta.set(angle)
  }, [angle, reduce, theta])
  const upright = useTransform(theta, (t) => -t)
  return (
    <motion.div style={{ rotate: theta }} className="absolute inset-0">
      <span ref={syncSpin} className={cn("absolute top-0 left-1/2 -mt-6 -ml-6 size-12", spin && ORBIT_COUNTER_SPIN)}>
        <motion.span
          style={{ rotate: upright }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={SPRING}
          className="grid size-full place-items-center rounded-full border border-white/10 bg-[#11161d]/90 text-2xl shadow-lg shadow-black/50"
        >
          {emoji}
        </motion.span>
      </span>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Telefonens innehåll: Framsteg                                       */
/* ------------------------------------------------------------------ */

const CLIENT_TABS: { label: string; icon: LucideIcon; active?: boolean }[] = [
  { label: "Idag", icon: House },
  { label: "Kalender", icon: CalendarDays },
  { label: "Hitta PT", icon: Search },
  { label: "Framsteg", icon: ChartLine, active: true },
  { label: "Chatt", icon: MessageCircle },
]

const TILES: Record<Role, { label: string; value: string; sub: string; icon: LucideIcon }[]> = {
  client: [
    { label: "Genomförda pass", value: "24", sub: "6 egna pass", icon: Trophy },
    { label: "Veckor i rad", value: "7", sub: "med minst ett pass", icon: Flame },
  ],
  pt: [
    { label: "Betalda pass kvar", value: "4", sub: "6 av 10 använda", icon: Ticket },
    { label: "Genomförda pass", value: "24", sub: "6 egna pass", icon: Trophy },
  ],
}

/**
 * Framsteg-vyn. Varje ändring sveper ett grönt ljus över skärmen, nya
 * intressen glider in (layout-animation) och skärmen rullar fram till dem.
 */
function FramstegScreen({ role, chosen, groups, pulse, run, reduce }: { role: Role; chosen: InterestDef[]; groups: Group[]; pulse: Pulse; run: boolean; reduce: boolean }) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)
  const primary = chosen[0]

  React.useEffect(() => {
    const box = scrollRef.current
    const list = listRef.current
    if (!box || !list) return
    const behavior = reduce ? "auto" : "smooth"
    if (pulse.kind === "role" || pulse.kind === "clear") {
      box.scrollTo({ top: 0, behavior })
      return
    }
    if (pulse.kind !== "add" || !pulse.focus) return
    const el = list.querySelector<HTMLElement>(`[data-group="${pulse.focus}"]`)
    if (el) box.scrollTo({ top: Math.max(0, list.offsetTop + el.offsetTop - 10), behavior })
  }, [pulse, reduce])

  return (
    // Kortare skärm i mobilen; den rullar ändå fram till det mål man nyss valde.
    <div className="relative h-[430px] sm:h-[540px]">
      <svg aria-hidden width="0" height="0" className="absolute">
        <defs>
          <linearGradient id="mal-spark-fyllning" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#aced37" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#aced37" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      <Sweep n={pulse.n} />

      <motion.div
        ref={scrollRef}
        layoutScroll
        tabIndex={0}
        role="group"
        aria-label="Exempel: Framsteg i Coavira-appen. Rulla för fler mätpunkter."
        className={cn(
          "absolute inset-0 overflow-y-auto px-3.5 pt-1.5 [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset [&::-webkit-scrollbar]:hidden",
          role === "client" ? "pb-20" : "pb-6"
        )}
      >
        <LayoutGroup id="mal-framsteg">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={role}
              layout="position"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12, transition: { duration: 0.2 } }}
              transition={{ duration: 0.4, ease: EASE }}
            >
              {role === "pt" ? <PtHeader chosen={chosen} /> : <ClientHeader />}
            </motion.div>
          </AnimatePresence>

          <motion.div layout="position" transition={SOFT_SPRING} className="relative">
            <AnimatePresence mode="popLayout" initial={false}>
              {primary && (
                <motion.p
                  key={primary.key}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
                  transition={{ duration: 0.35, ease: EASE }}
                  className="mt-2.5 rounded-xl bg-white/[0.05] px-3 py-2 text-[11px] leading-snug"
                >
                  “{FOCUS[primary.key] ?? `Bli bättre på ${primary.label.toLowerCase()}`}”
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>

          <div ref={listRef} className="relative mt-3 space-y-4">
            <AnimatePresence mode="popLayout" initial={false}>
              {groups.length === 0 ? (
                <motion.div
                  key="tomt"
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  transition={{ duration: 0.35, ease: EASE }}
                  className="flex flex-col items-start gap-1.5 rounded-xl border border-dashed border-white/15 p-3 text-[11px]"
                >
                  <p className="flex items-center gap-1.5 font-medium">
                    <Sparkles aria-hidden className="size-3.5 text-primary" /> Välj dina intressen
                  </p>
                  <p className="text-muted-foreground">
                    {role === "pt" ? "Klienten har inte valt några intressen än." : "Välj vad du tränar för så visas rätt mätpunkter här."}
                  </p>
                </motion.div>
              ) : (
                groups.map(({ interest, metrics }, g) => (
                  <motion.div
                    key={interest.key}
                    layout
                    data-group={interest.key}
                    role="group"
                    aria-label={interest.label}
                    initial={{ opacity: 0, y: 28, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.2 } }}
                    transition={SOFT_SPRING}
                    className="origin-top"
                  >
                    <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
                      <span aria-hidden>{interest.emoji}</span> {interest.label}
                      <span className="ml-auto text-[10px] font-normal tabular-nums">
                        {metrics.length} {metrics.length === 1 ? "mätpunkt" : "mätpunkter"}
                      </span>
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {metrics.map((metric, i) => (
                        <MetricCard
                          key={`${role}-${metric.key}`}
                          metric={metric}
                          role={role}
                          run={run}
                          delay={(pulse.kind === "add" ? 0 : g * 0.15) + i * 0.07}
                          wide={metrics.length % 2 === 1 && i === metrics.length - 1}
                        />
                      ))}
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>

          <motion.div layout="position" transition={SOFT_SPRING} className="mt-4 grid grid-cols-2 gap-2">
            {TILES[role].map(({ label, value, sub, icon: Icon }) => (
              <div key={label} className="rounded-xl border border-white/[0.07] bg-card p-2.5">
                <p className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
                  {label}
                  <Icon aria-hidden className="size-3" />
                </p>
                <p className="mt-1 text-[18px] leading-none font-bold tabular-nums">{value}</p>
                <p className="mt-1 text-[9.5px] text-muted-foreground">{sub}</p>
              </div>
            ))}
          </motion.div>
        </LayoutGroup>
      </motion.div>

      <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 z-10 h-10 bg-gradient-to-t from-background to-transparent", role === "client" ? "bottom-14" : "bottom-0")} />
      <AnimatePresence initial={false}>
        {role === "client" && (
          <motion.div
            key="flikar"
            aria-hidden
            initial={{ y: 64 }}
            animate={{ y: 0 }}
            exit={{ y: 64 }}
            transition={SOFT_SPRING}
            className="absolute inset-x-0 bottom-0 z-10 grid h-14 grid-cols-5 border-t border-white/[0.06] bg-background/95 px-1 pb-1"
          >
            {CLIENT_TABS.map(({ label, icon: Icon, active }) => (
              <span key={label} className={cn("relative flex flex-col items-center justify-center gap-0.5 text-[9px]", active ? "font-semibold text-brand" : "text-muted-foreground")}>
                {active && <span className="absolute top-0 h-0.5 w-6 rounded-full bg-brand" />}
                <Icon className="size-4" />
                {label}
              </span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Klientens rubrik: "Framsteg" och "Dina mål", som i appen. */
function ClientHeader() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-[22px] leading-tight font-bold tracking-tight">Framsteg</p>
        <span aria-hidden className="grid size-8 place-items-center rounded-full bg-brand/15 text-[11px] font-semibold text-brand">
          SL
        </span>
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-semibold">Dina mål</p>
        <span className="text-[11px] text-primary">Ändra intressen</span>
      </div>
    </div>
  )
}

/** PT:ns vy av en klient: namn, intressen och fliken Progress. */
function PtHeader({ chosen }: { chosen: InterestDef[] }) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <ArrowLeft aria-hidden className="size-3" /> Alla klienter
      </p>
      <div className="mt-2 flex items-center gap-2.5">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-[13px] font-semibold text-emerald-300">
          SL
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-1.5 text-[15px] leading-tight font-semibold">
            Sara Lindqvist
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-1.5 py-px text-[9px] font-normal">
              <span aria-hidden className="size-1.5 rounded-full bg-success" /> Aktiv
            </span>
          </p>
          <p className="text-[10px] text-muted-foreground">Klient sedan 2 sep</p>
        </div>
      </div>
      <ul aria-label="Intressen" className="relative mt-2 flex min-h-5 flex-wrap gap-1">
        <AnimatePresence mode="popLayout" initial={false}>
          {chosen.map((interest) => (
            <motion.li
              key={interest.key}
              layout
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={SPRING}
              className="inline-flex items-center gap-1 rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px]"
            >
              <span aria-hidden>{interest.emoji}</span> {interest.label}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <div aria-hidden className="mt-3 grid grid-cols-4 rounded-lg bg-white/[0.05] p-0.5 text-center text-[10px]">
        {["Progress", "Pass", "Kost", "Chatt"].map((tab, i) => (
          <span key={tab} className={cn("rounded-md py-1", i === 0 ? "bg-background font-semibold text-foreground shadow-sm" : "text-muted-foreground")}>
            {tab}
          </span>
        ))}
      </div>
      <p className="mt-3 text-[13px] font-semibold">Mål och mätpunkter</p>
      <p className="text-[10px] text-muted-foreground">Utifrån klientens intressen</p>
    </div>
  )
}

/** Ett grönt ljussvep uppifrån och ned vid varje ändring. */
function Sweep({ n }: { n: number }) {
  if (!n) return null
  return (
    <motion.div
      key={n}
      aria-hidden
      initial={{ y: -120, opacity: 0 }}
      animate={{ y: 560, opacity: [0, 1, 1, 0] }}
      transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
      className="pointer-events-none absolute inset-x-0 top-0 z-20 h-28 bg-[linear-gradient(to_bottom,transparent,rgba(172,237,55,0.08)_70%,rgba(172,237,55,0.32)_97%,transparent)]"
    />
  )
}

/** En mätpunkt: riktig etikett och enhet, exempelvärde som räknas upp, trend och minigraf. */
function MetricCard({ metric, role, run, delay, wide }: { metric: MetricDef; role: Role; run: boolean; delay: number; wide: boolean }) {
  const sample = sampleOf(metric)
  const delta = sample.latest - sample.first
  const improving = metric.lowerIsBetter ? delta < 0 : delta > 0
  const Trend = delta < 0 ? TrendingDown : TrendingUp
  const change = metric.format === "time" ? formatSeconds(Math.abs(delta)) : `${num(Math.abs(delta))}${shortUnit(metric)}`
  const best = wide ? `${mainText(metric, sample.best)}${unitOf(metric) ? ` ${unitOf(metric)}` : ""}` : `${mainText(metric, sample.best)}${shortUnit(metric)}`
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay: 0.08 + delay }}
      className={cn("flex min-w-0 flex-col gap-1 rounded-xl border border-white/[0.07] bg-card p-2.5", wide && "col-span-2")}
    >
      <div className="flex items-start justify-between gap-1">
        <p className={cn("text-[10px] leading-tight text-muted-foreground", !wide && "line-clamp-2 min-h-[2lh]")}>{metric.label}</p>
        {metric.auto ? (
          <span className="shrink-0 rounded-full bg-brand/15 px-1.5 py-px text-[8.5px] font-semibold text-brand">Auto</span>
        ) : (
          role === "client" && (
            <span aria-hidden className="-mt-0.5 -mr-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-white/[0.06] text-muted-foreground">
              <Plus className="size-3" />
            </span>
          )
        )}
      </div>
      <p className="flex flex-wrap items-baseline gap-x-1">
        <Ticker metric={metric} from={sample.first} to={sample.latest} run={run} delay={0.15 + delay} />
        {unitOf(metric) && <span className="text-[10px] text-muted-foreground">{unitOf(metric)}</span>}
      </p>
      <Sparkline values={sample.series} invert={metric.lowerIsBetter} run={run} delay={0.2 + delay} wide={wide} />
      <p className="flex flex-wrap items-center justify-between gap-x-2 text-[10px] tabular-nums">
        <span className={cn("inline-flex items-center gap-0.5 font-medium", improving ? "text-success" : "text-muted-foreground")}>
          <Trend aria-hidden className="size-3" />
          <span className="sr-only">{improving ? "Förbättring" : "Förändring"} sedan start:</span>
          {change}
        </span>
        <span className="inline-flex items-center gap-0.5 text-muted-foreground">
          <Trophy aria-hidden className="size-2.5" />
          <span className="sr-only">Bästa:</span>
          {best}
        </span>
      </p>
    </motion.div>
  )
}

/** Räknar från första mätningen till den senaste när telefonen syns (direkt med "minska rörelse"). */
function Ticker({ metric, from, to, run, delay }: { metric: MetricDef; from: number; to: number; run: boolean; delay: number }) {
  const reduce = useReducedMotion()
  const value = useMotionValue(from)
  const step = (RANGES[metric.key] ?? fallbackRange(metric)).step
  const text = useTransform(value, (v) => mainText(metric, Math.round(v / step) * step))
  React.useEffect(() => {
    if (!run) return
    if (reduce) {
      value.set(to)
      return
    }
    const controls = animate(value, to, { duration: 1.3, ease: EASE, delay })
    return () => controls.stop()
  }, [run, reduce, to, value, delay])
  return <motion.span className="text-[18px] leading-none font-bold tracking-tight tabular-nums">{text}</motion.span>
}

const clampY = (y: number, h: number) => Math.min(h - 1, Math.max(1, y))
const fx = (v: number) => v.toFixed(1)

/** Mjuk kurva (Catmull-Rom → Bézier) genom punkterna. Uppåt = bättre, inverteras för tider. */
function sparkPaths(values: number[], invert: boolean | undefined, w: number, h: number) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => {
    const n = (v - min) / span
    return [1 + (i / (values.length - 1)) * (w - 5), h - 3 - (invert ? 1 - n : n) * (h - 8)] as const
  })
  let line = `M${fx(pts[0][0])} ${fx(pts[0][1])}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, clampY(p1[1] + (p2[1] - p0[1]) / 6, h)]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, clampY(p2[1] - (p3[1] - p1[1]) / 6, h)]
    line += ` C${fx(c1[0])} ${fx(c1[1])} ${fx(c2[0])} ${fx(c2[1])} ${fx(p2[0])} ${fx(p2[1])}`
  }
  const end = pts[pts.length - 1]
  return { line, area: `${line} L${fx(end[0])} ${h} L1 ${h} Z`, end }
}

/** Minigraf som ritas fram (pathLength) med en tonad yta och en prick för senaste värdet. */
function Sparkline({ values, invert, run, delay, wide }: { values: number[]; invert?: boolean; run: boolean; delay: number; wide: boolean }) {
  const reduce = useReducedMotion()
  const w = wide ? 240 : 120
  const h = 28
  const { line, area, end } = sparkPaths(values, invert, w, h)
  // Med "minska rörelse" visas grafen direkt (initial är densamma som på servern).
  const shown = run || !!reduce
  const instant = reduce ? { duration: 0 } : undefined
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden className="h-7 w-full overflow-visible text-brand">
      <motion.path
        d={area}
        fill="url(#mal-spark-fyllning)"
        initial={{ opacity: 0 }}
        animate={{ opacity: shown ? 1 : 0 }}
        transition={instant ?? { duration: 0.8, delay: delay + 0.5 }}
      />
      <motion.path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: shown ? 1 : 0 }}
        transition={instant ?? { duration: 1.2, ease: EASE, delay }}
      />
      <motion.circle
        cx={end[0]}
        cy={end[1]}
        fill="currentColor"
        initial={{ r: 0 }}
        animate={{ r: shown ? 2.6 : 0 }}
        transition={instant ?? { type: "spring", stiffness: 400, damping: 14, delay: delay + 1 }}
      />
    </svg>
  )
}
