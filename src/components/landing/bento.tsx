"use client"

/**
 * Funktionssektionen (#funktioner): ett bento-rutnät med levande mini-demos –
 * PT & klient i synk, kostschema med appens riktiga enhetslogik, kalender med
 * passgräns, verifierade PT:er, kortbetalning och anslutningar. Allt styrs med
 * tangentbord.
 *
 * Prestanda: alla eviga loopar är ren CSS som bara animerar transform/opacity
 * (kompositorn, ingen JavaScript per bildruta). De monteras bara när kortet syns
 * och står still med "minska rörelse". Inga filter-glöd (blur) och ingen
 * scroll-parallax under md.
 *
 * Mobil (under md): kompakt – betal- och anslutningskorten döljs, demona är
 * kortare och dekorpaneler göms. Desktop ser ut som förut.
 */
import { animate, AnimatePresence, LayoutGroup, motion, useInView, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion"
import {
  Activity,
  BadgeCheck,
  CalendarCheck,
  CalendarDays,
  Check,
  CreditCard,
  Dumbbell,
  FileCheck,
  GripVertical,
  Heart,
  KeyRound,
  Link2,
  Lock,
  LockKeyhole,
  Mail,
  MessageCircle,
  Minus,
  Plug,
  Plus,
  RotateCcw,
  ScanBarcode,
  Search,
  ShieldCheck,
  UserCheck,
  Utensils,
  Watch,
  Wifi,
  type LucideIcon,
} from "lucide-react"
import * as React from "react"

import { BrandGlyph } from "@/components/brand"
import { LINKS } from "@/components/landing/links"
import { StoreBadges } from "@/components/landing/store-badges"
import { EASE, GlassCard, GlowOrb, GradientText, GridBackdrop, PhoneFrame, Reveal, Section, TiltCard, useConfetti } from "@/components/landing/primitives"
import { MACROS, MacroDot, sumMacros } from "@/components/nutrition/macros"
import { BRAND } from "@/lib/brand"
import { FOODS } from "@/lib/foods"
import { formatSek } from "@/lib/money"
import { allowedUnits, amountOf, foodKind, itemFromFood, setAmount, switchUnit, type FoodKind } from "@/lib/nutrition/meal-items"
import { cn } from "@/lib/utils"
import type { MealItem, MealUnit } from "@/types/domain"

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
const SPRING = { type: "spring", stiffness: 420, damping: 32 } as const
const SOFT_SPRING = { type: "spring", stiffness: 160, damping: 24 } as const
/** Appens panelbakgrund (kort i mörkt läge) för mockups inne i glaskorten. */
const PANEL = "rounded-2xl border border-white/10 bg-[#0d1218]/90 shadow-2xl shadow-black/40"
const PRIMARY_BTN =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-brand-foreground shadow-[0_10px_30px_-10px] shadow-brand/70 transition-colors hover:bg-brand/90"
const GHOST_BTN =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-foreground transition-colors hover:border-white/20 hover:bg-white/[0.08]"

/** Svensk decimalform: 2.75 → "2,75" (utan fast antal decimaler om inget anges). */
const sv = (n: number, decimals?: number) => (decimals === undefined ? String(Math.round(n * 100) / 100) : Math.max(0, n).toFixed(decimals)).replace(".", ",")

/**
 * Sektionens egna nyckelrutor (bara transform och opacity → körs på kompositorn).
 * - bento-travel: ljuspunkt från --bento-from-x/y till --bento-to-x/y, tonar in och ut, vilar sista 20 %.
 * - bento-ring: pulsring som växer till --bento-ring-scale och tonar ut från --bento-ring-from.
 * Läggs i <head> en gång via React 19:s <style href precedence>.
 */
const KEYFRAMES = `
@keyframes bento-travel {
  0% { transform: translate3d(var(--bento-from-x, 0), var(--bento-from-y, 0), 0); opacity: 0 }
  12%, 68% { opacity: 1 }
  80%, 100% { transform: translate3d(var(--bento-to-x, 0), var(--bento-to-y, 0), 0); opacity: 0 }
}
@keyframes bento-ring {
  0% { transform: scale(1); opacity: var(--bento-ring-from, 0.6) }
  100% { transform: scale(var(--bento-ring-scale, 1.5)); opacity: 0 }
}
`

/** Inline-stil med CSS-variabler (t.ex. för nyckelrutorna ovan). */
const cssVars = (vars: Record<string, string>) => vars as React.CSSProperties

/** Levande loopar körs bara när elementet syns och rörelse är tillåten. */
function useLive(ref: React.RefObject<Element | null>) {
  const reduce = useReducedMotion()
  const inView = useInView(ref, { margin: "-10% 0px" })
  return inView && !reduce
}

const MD_QUERY = "(min-width: 768px)"
const subscribeMd = (onChange: () => void) => {
  const mq = window.matchMedia(MD_QUERY)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}

/** Sant från md (768 px). Servern och första renderingen räknar med mobil, så hydreringen blir lika. */
function useIsMd() {
  return React.useSyncExternalStore(
    subscribeMd,
    () => window.matchMedia(MD_QUERY).matches,
    () => false
  )
}

/** Tal som räknar upp med fjäder när `start` blir sant – hoppar direkt med "minska rörelse". */
function AnimatedNumber({ value, start = true, decimals = 0, className }: { value: number; start?: boolean; decimals?: number; className?: string }) {
  const reduce = useReducedMotion()
  const spring = useSpring(0, { stiffness: 110, damping: 20, mass: 0.7 })
  const text = useTransform(spring, (v) => sv(v, decimals))
  React.useEffect(() => {
    const target = start || reduce ? value : 0
    if (reduce) spring.jump(target)
    else spring.set(target)
  }, [spring, start, reduce, value])
  return (
    <>
      <motion.span aria-hidden className={cn("tabular", className)}>
        {text}
      </motion.span>
      <span className="sr-only">{sv(value, decimals)}</span>
    </>
  )
}

/** Initialer i en rund bricka (mockup-avatar). */
function Initials({ name, className, muted }: { name: string; className?: string; muted?: boolean }) {
  const letters = name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-bold",
        muted ? "bg-white/10 text-foreground" : "bg-brand text-brand-foreground",
        className
      )}
    >
      {letters}
    </span>
  )
}

// ------------------------------------------------------------ bentokort ---

/**
 * Ett kort i rutnätet: lutar mot pekaren (TiltCard), lyfter vid hovring och
 * har en glödande överkant. Rubriken är h3 under sektionens h2.
 * Intoningen räknar bara marginal uppåt/nedåt, så att ett kort som sticker
 * fram i den svepbara raden på mobil syns direkt.
 */
function BentoCard({
  icon: Icon,
  kicker,
  title,
  text,
  children,
  className,
  delay = 0,
  tilt = 5,
}: {
  icon: LucideIcon
  kicker: string
  title: React.ReactNode
  text: React.ReactNode
  children: React.ReactNode
  className?: string
  delay?: number
  tilt?: number
}) {
  return (
    <Reveal delay={delay} viewport={{ once: true, margin: "-80px 0px" }} className={cn("min-w-0", className)}>
      <TiltCard max={tilt} className="h-full [&>div]:rounded-3xl">
        <GlassCard
          whileHover={{ y: -4 }}
          transition={SOFT_SPRING}
          className="flex h-full flex-col bg-gradient-to-b from-white/[0.06] to-white/[0.015] p-5 transition-colors duration-300 group-hover:border-white/20 sm:p-7"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-brand/70 to-transparent opacity-40 transition-opacity duration-500 group-hover:opacity-100"
          />
          {/* Mobil: mindre ikon, rubrik och luft – samma uttryck som desktop från sm. */}
          <div className="relative">
            <div className="flex items-center gap-2.5">
              <span className="grid size-7 place-items-center rounded-lg bg-brand/10 text-brand ring-1 ring-brand/25 sm:size-9 sm:rounded-xl">
                <Icon aria-hidden className="size-4 sm:size-[18px]" />
              </span>
              <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{kicker}</span>
            </div>
            <h3 className="mt-3 text-xl leading-tight font-bold tracking-tight text-balance sm:mt-4 sm:text-[1.75rem]">{title}</h3>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-pretty text-muted-foreground sm:mt-2 sm:text-[15px]">{text}</p>
          </div>
          <div className="relative mt-4 flex flex-1 flex-col sm:mt-6">{children}</div>
        </GlassCard>
      </TiltCard>
    </Reveal>
  )
}

// ----------------------------------------------------- 1. PT & klient ---

type SyncStep = 0 | 1 | 2

interface PassRow {
  id: string
  name: string
  detail: string
}

const PASS_BLOCKS: { key: string; label: string; rows: PassRow[] }[] = [
  { key: "warm", label: "Uppvärmning", rows: [{ id: "rodd", name: "Roddmaskin", detail: "5 min" }] },
  {
    key: "main",
    label: "Huvudpass",
    rows: [
      { id: "knaboj", name: "Knäböj", detail: "4 × 6 · 80 kg" },
      { id: "rdl", name: "Rumänsk marklyft", detail: "3 × 8 · 60 kg" },
    ],
  },
  { key: "cool", label: "Nedvarvning", rows: [{ id: "stretch", name: "Höftstretch", detail: "2 × 45 s" }] },
]
const EXTRA_ROW: PassRow = { id: "bulgarisk", name: "Bulgarisk utfallsböj", detail: "3 × 10 · 14 kg" }
const SYNC_STEPS = ["Planera", "Synka", "Klarmarkera"] as const

const rowsFor = (key: string, rows: PassRow[], step: SyncStep) => (key === "main" && step >= 1 ? [...rows, EXTRA_ROW] : rows)

/**
 * Ljusstråle mellan PT-panelen och klientens telefon; `pulse` skickar en extra ljuspuls.
 * Ljuspunkterna är CSS-animationer (bento-travel) på ett lager lika stort som strålen,
 * så att -50 % → 50 % betyder strålens ena ände → den andra.
 */
function Beam({ pulse, live, axis }: { pulse: number; live: boolean; axis: "x" | "y" }) {
  const horizontal = axis === "x"
  const dot = "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
  const travel = cssVars(horizontal ? { "--bento-from-x": "-50%", "--bento-to-x": "50%" } : { "--bento-from-y": "-50%", "--bento-to-y": "50%" })
  return (
    <div aria-hidden className={cn("relative", horizontal ? "h-px w-full" : "h-5 w-px")}>
      <div className={cn("absolute inset-0 rounded-full from-brand/10 via-brand/70 to-brand/10", horizontal ? "bg-gradient-to-r" : "bg-gradient-to-b")} />
      <span className={cn("absolute size-2 rounded-full bg-brand shadow-[0_0_12px_2px] shadow-brand/60", horizontal ? "top-1/2 -left-1 -translate-y-1/2" : "-top-1 left-1/2 -translate-x-1/2")} />
      <span className={cn("absolute size-2 rounded-full bg-brand shadow-[0_0_12px_2px] shadow-brand/60", horizontal ? "top-1/2 -right-1 -translate-y-1/2" : "-bottom-1 left-1/2 -translate-x-1/2")} />
      {live && (
        <div style={travel} className="absolute inset-0 animate-[bento-travel_2.7s_ease-in-out_infinite_both] will-change-transform">
          <span className={cn("absolute size-1.5 rounded-full bg-white shadow-[0_0_10px_3px] shadow-brand/70", dot)} />
        </div>
      )}
      {/* Engångspuls vid varje steg – nyckeln startar om animationen. */}
      {pulse > 0 && (
        <div key={pulse} style={travel} className="absolute inset-0 animate-[bento-travel_0.9s_cubic-bezier(0.22,1,0.36,1)_both]">
          <span className={cn("absolute size-3 rounded-full bg-brand shadow-[0_0_24px_8px] shadow-brand/70", dot)} />
        </div>
      )}
    </div>
  )
}

/** PT:ns passbyggare (mockup). */
function PtPanel({ step }: { step: SyncStep }) {
  return (
    <div className={cn(PANEL, "relative p-3.5 sm:p-4")}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Initials name="Elin Söderberg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Passbyggare</p>
            <p className="truncate text-xs text-muted-foreground">Elin Söderberg · PT</p>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-muted-foreground tabular">Tis 07:00</span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Ben & core</p>
        <p className="text-xs text-muted-foreground">till Sara L.</p>
      </div>
      <LayoutGroup id="bento-pt">
        <div className="mt-2.5 space-y-2">
          {PASS_BLOCKS.map((block) => (
            <motion.div layout key={block.key} transition={SPRING} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-1.5">
              <motion.p layout="position" className="px-1.5 pt-0.5 pb-1 text-[10px] font-semibold tracking-wider text-brand uppercase">
                {block.label}
              </motion.p>
              <ul className="relative">
                <AnimatePresence initial={false} mode="popLayout">
                  {rowsFor(block.key, block.rows, step).map((row) => (
                    <motion.li
                      key={row.id}
                      layout
                      initial={{ opacity: 0, x: -14 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 14 }}
                      transition={SPRING}
                      className={cn(
                        "flex h-7 items-center gap-2 rounded-lg px-1.5 text-xs",
                        row.id === EXTRA_ROW.id && "bg-brand/10 ring-1 ring-brand/25"
                      )}
                    >
                      <GripVertical aria-hidden className="size-3.5 shrink-0 text-muted-foreground/60" />
                      <span className="min-w-0 flex-1 truncate font-medium">{row.name}</span>
                      <span className="shrink-0 text-muted-foreground tabular">{row.detail}</span>
                    </motion.li>
                  ))}
                  {block.key === "main" && step === 0 && (
                    <motion.li
                      key="ghost"
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.2 }}
                      aria-hidden
                      className="flex h-7 items-center gap-2 rounded-lg border border-dashed border-white/15 px-1.5 text-xs text-muted-foreground"
                    >
                      <Plus className="size-3.5 shrink-0" />
                      Lägg till övning
                    </motion.li>
                  )}
                </AnimatePresence>
              </ul>
            </motion.div>
          ))}
        </div>
      </LayoutGroup>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-medium">
        <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.05] px-2 py-1 text-muted-foreground">
          {step === 2 ? <Check aria-hidden className="size-3 text-brand" /> : <span aria-hidden className="size-1.5 rounded-full bg-muted-foreground/60" />}
          {step === 2 ? "Vikter ifyllda efter passet" : "Vikter fylls i efter passet"}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-1 transition-colors duration-300",
            step === 2 ? "bg-brand/15 text-brand" : "bg-white/[0.05] text-muted-foreground"
          )}
        >
          {step === 2 ? <Check aria-hidden className="size-3" /> : <span aria-hidden className="size-1.5 rounded-full bg-muted-foreground/60" />}
          {step === 2 ? "Klarmarkerat" : "Ej klarmarkerat"}
        </span>
      </div>
    </div>
  )
}

const PT_CHIP_TEXT: Record<SyncStep, string> = {
  0: "Bygger passet Ben & core",
  1: "La till Bulgarisk utfallsböj",
  2: "Vikter ifyllda efter passet",
}

/** Mobil: kompakt PT-bricka i stället för hela passbyggaren (samma pass syns ju i telefonen). Följer demons steg. */
function PtChip({ step }: { step: SyncStep }) {
  return (
    <div className={cn(PANEL, "flex w-full max-w-[17rem] items-center gap-2.5 rounded-full py-1.5 pr-4 pl-1.5")}>
      <Initials name="Elin Söderberg" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold">Elin Söderberg · PT</p>
        <div className="relative h-4 overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.p
              key={step}
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -12, opacity: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="truncate text-[11px] leading-4 text-muted-foreground"
            >
              {PT_CHIP_TEXT[step]}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
      {step === 2 && <Check aria-hidden className="size-4 shrink-0 text-brand" />}
    </div>
  )
}

/**
 * Klientens telefon: samma pass, synkat. Dold för skärmläsare – ändringarna läses upp via demons statusrad.
 * Mobil: lägre skärm utan flikrad (dekor), så att kortet inte blir en hel skärm långt.
 */
function ClientPhone({ step, pulse, live }: { step: SyncStep; pulse: number; live: boolean }) {
  return (
    <div aria-hidden className="flex justify-center">
      <PhoneFrame className="w-[248px] sm:w-[256px]" time={step === 2 ? "08:04" : "06:58"}>
        <div className="flex h-[336px] flex-col gap-2 px-3.5 pt-2 pb-3 md:h-[372px] md:gap-2.5 md:pb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted-foreground">Tisdag · Sara</p>
              <p className="text-sm font-semibold">Dagens pass</p>
            </div>
            <motion.span
              key={pulse}
              initial={pulse ? { scale: 0.85, opacity: 0.5 } : false}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 18 }}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-semibold text-brand"
            >
              <span className="relative flex size-1.5">
                {live && <span className="absolute inset-0 animate-ping rounded-full bg-brand/70 will-change-transform motion-reduce:animate-none" />}
                <span className="relative size-1.5 rounded-full bg-brand" />
              </span>
              Synkat
            </motion.span>
          </div>
          <motion.div layout transition={SPRING} className="rounded-2xl border border-border bg-card p-2.5">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-xl bg-brand text-brand-foreground">
                <Dumbbell aria-hidden className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">Ben & core</p>
                <p className="truncate text-[10px] text-muted-foreground tabular">{step === 2 ? "Genomfört 07:00–07:55" : "07:00 · med Elin"}</p>
              </div>
              <AnimatePresence>
                {step === 2 && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 20 }}
                    className="grid size-6 place-items-center rounded-full bg-brand text-brand-foreground"
                  >
                    <Check aria-hidden className="size-3.5" />
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <div className="mt-2 space-y-1.5">
              {PASS_BLOCKS.map((block) => (
                <motion.div layout="position" key={block.key}>
                  <p className="text-[9px] font-semibold tracking-wider text-muted-foreground uppercase">{block.label}</p>
                  <ul>
                    <AnimatePresence initial={false}>
                      {rowsFor(block.key, block.rows, step).map((row) => (
                        <motion.li
                          key={row.id}
                          layout
                          initial={{ opacity: 0, y: -8, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ ...SPRING, delay: row.id === EXTRA_ROW.id ? 0.55 : 0 }}
                          className="flex items-center gap-1.5 py-0.5 text-[11px]"
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "grid size-3.5 shrink-0 place-items-center rounded-full transition-colors duration-300",
                              step === 2 ? "bg-brand text-brand-foreground" : "ring-1 ring-white/20"
                            )}
                          >
                            {step === 2 && <Check className="size-2.5" />}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{row.name}</span>
                          {row.id === EXTRA_ROW.id && step === 1 && <span className="rounded-full bg-brand/15 px-1.5 text-[9px] font-semibold text-brand">Ny</span>}
                          <span className="shrink-0 text-muted-foreground tabular">{row.detail.split(" · ")[1] ?? row.detail}</span>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                </motion.div>
              ))}
            </div>
          </motion.div>
          <AnimatePresence>
            {step === 2 && (
              <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ type: "spring", stiffness: 380, damping: 26, delay: 0.15 }}
                className="mt-auto flex items-center gap-2 rounded-2xl bg-brand px-3 py-2.5 text-xs font-semibold text-brand-foreground shadow-lg shadow-brand/25"
              >
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-foreground/15">
                  <Check aria-hidden className="size-3.5" />
                </span>
                Klarmarkerat av Elin ✓
              </motion.div>
            )}
          </AnimatePresence>
          <div aria-hidden className={cn("hidden items-center justify-around rounded-2xl border border-border bg-card/80 py-2 text-muted-foreground md:flex", step !== 2 && "mt-auto")}>
            {[Dumbbell, CalendarDays, Utensils, MessageCircle].map((TabIcon, i) => (
              <TabIcon key={i} className={cn("size-4", i === 0 && "text-brand")} />
            ))}
          </div>
        </div>
      </PhoneFrame>
    </div>
  )
}

/** Demo: PT:n lägger till en övning → syns hos klienten → klarmarkeras. Spelas upp en gång av sig själv. */
function SyncDemo() {
  const ref = React.useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const live = useLive(ref)
  const seen = useInView(ref, { once: true, margin: "-25% 0px" })
  const [step, setStep] = React.useState<SyncStep>(0)
  const [pulse, setPulse] = React.useState(0)
  const [message, setMessage] = React.useState("")
  const timers = React.useRef<number[]>([])
  const fire = useConfetti()

  const clearTimers = React.useCallback(() => {
    for (const t of timers.current) window.clearTimeout(t)
    timers.current = []
  }, [])

  /** `announce` = false när demon spelar upp sig själv – då läses inget upp för den som bara scrollar förbi. */
  const goTo = React.useCallback((next: SyncStep, announce = true) => {
    setStep(next)
    if (next > 0) setPulse((p) => p + 1)
    if (!announce) return
    setMessage(
      next === 0
        ? "Demon är återställd."
        : next === 1
          ? "Elin lade till Bulgarisk utfallsböj. Övningen syns direkt i Saras app."
          : "Passet är genomfört, vikterna ifyllda och klarmarkerat av Elin."
    )
  }, [])

  // Spelas upp av sig själv en gång när kortet syns (inte med "minska rörelse").
  React.useEffect(() => {
    if (!seen || reduce) return
    timers.current = [window.setTimeout(() => goTo(1, false), 1300), window.setTimeout(() => goTo(2, false), 3900)]
    return clearTimers
  }, [seen, reduce, goTo, clearTimers])

  const next = (e: React.MouseEvent<HTMLButtonElement>) => {
    clearTimers()
    if (step === 0) goTo(1)
    else if (step === 1) {
      goTo(2)
      void fire(e.currentTarget, { particles: 70, spread: 65 })
    } else goTo(0)
  }

  const label = step === 0 ? "Lägg till övning" : step === 1 ? "Klarmarkera passet" : "Spela igen"
  const Icon = step === 0 ? Plus : step === 1 ? Check : RotateCcw

  return (
    <div ref={ref} className="flex flex-1 flex-col">
      <div className="relative grid flex-1 items-center gap-3 md:grid-cols-[minmax(0,1fr)_4.5rem_auto] md:gap-0">
        <GridBackdrop className="opacity-60" />
        {/* Mobil: PT-bricka + stråle i stället för hela passbyggaren, så att kortet inte blir två skärmar långt. */}
        <div className="hidden md:block">
          <PtPanel step={step} />
        </div>
        <div className="flex flex-col items-center gap-3 md:hidden">
          <PtChip step={step} />
          <Beam pulse={pulse} live={live} axis="y" />
        </div>
        <div className="hidden px-3 md:block">
          <Beam pulse={pulse} live={live} axis="x" />
        </div>
        <ClientPhone step={step} pulse={pulse} />
      </div>
      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-xs" aria-label="Steg i demon">
          {SYNC_STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-1.5" aria-current={i === step ? "step" : undefined}>
              <span
                className={cn(
                  "grid size-5 place-items-center rounded-full text-[10px] font-bold transition-colors duration-300",
                  i <= step ? "bg-brand text-brand-foreground" : "bg-white/10 text-muted-foreground"
                )}
              >
                {i < step ? <Check aria-hidden className="size-3" /> : i + 1}
              </span>
              <span className={cn("transition-colors", i === step ? "font-medium text-foreground" : "text-muted-foreground")}>{s}</span>
              {i < SYNC_STEPS.length - 1 && <span aria-hidden className="mx-0.5 h-px w-4 bg-white/15" />}
            </li>
          ))}
        </ol>
        <motion.button type="button" whileTap={{ scale: 0.96 }} onClick={next} className={cn(PRIMARY_BTN, "min-w-52", FOCUS)}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={step}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="flex items-center gap-2"
            >
              <Icon aria-hidden className="size-4" />
              {label}
            </motion.span>
          </AnimatePresence>
        </motion.button>
      </div>
      <p aria-live="polite" className="sr-only">
        {message}
      </p>
    </div>
  )
}

// ---------------------------------------------------------- 2. Kost ---

const DEMO_FOODS: { name: string; amount: number; unit: MealUnit }[] = [
  { name: "Havregryn", amount: 1, unit: "dl" },
  { name: "Mjölk 3 %", amount: 2, unit: "dl" },
  { name: "Ägg", amount: 2, unit: "st" },
  { name: "Kycklingfilé", amount: 150, unit: "g" },
]

/** Startraderna byggs med appens egen logik (itemFromFood + setAmount). */
const START_ITEMS: MealItem[] = DEMO_FOODS.flatMap(({ name, amount, unit }) => {
  const food = FOODS.find((f) => f.name === name)
  return food ? [setAmount(itemFromFood(food), amount, unit)] : []
})

/** Exempelmål för dagen (mockup). */
const TARGETS = { kcal: 2100, protein: 140, carbs: 230, fat: 70 } as const
const STEP: Record<MealUnit, number> = { g: 10, st: 1, dl: 0.5, ml: 50, msk: 1, tsk: 1 }
const MAX: Record<MealUnit, number> = { g: 400, st: 6, dl: 5, ml: 500, msk: 6, tsk: 6 }
const KIND_HINT: Record<FoodKind, string> = {
  liquid: "Vätska · dl eller ml",
  oil: "Olja · msk, tsk, ml eller dl",
  grain: "Gryn · g eller dl",
  countable: "Räknas i st eller g",
  spoon: "g, msk eller tsk",
  solid: "Kött & fisk · bara g",
}
/** Antal livsmedelsrader som syns direkt på mobil – resten fälls ut med en knapp. */
const MOBILE_FOODS = 2
const PLANS = [
  { key: "elin", name: "Elin S." },
  { key: "johan", name: "Johan P." },
] as const
type PlanKey = (typeof PLANS)[number]["key"]

/** Rund +/−-knapp med 44 px träffyta. `aria-disabled` i stället för `disabled` så att fokus stannar kvar. */
function StepButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      aria-disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.86 }}
      onClick={() => {
        if (!disabled) onClick()
      }}
      className={cn(
        "relative grid size-9 place-items-center rounded-full bg-white/[0.06] text-foreground ring-1 ring-white/10 transition-colors before:absolute before:-inset-1 before:rounded-full hover:bg-white/[0.12] aria-disabled:cursor-not-allowed aria-disabled:opacity-35",
        FOCUS
      )}
    >
      {children}
    </motion.button>
  )
}

/** En livsmedelsrad: mängd (+/−) och enhetsval enligt appens logiska enheter. */
function FoodRow({ item, onChange, className }: { item: MealItem; onChange: (next: MealItem) => void; className?: string }) {
  const unit = item.unit ?? "g"
  const units = allowedUnits(item.name)
  const amount = amountOf(item)
  const step = STEP[unit]
  const label = `${sv(amount)} ${unit}`
  return (
    <li className={cn("rounded-2xl border border-white/[0.07] bg-white/[0.025] p-2.5 sm:p-3", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{item.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">{KIND_HINT[foodKind(item.name)]}</p>
        </div>
        <p className="shrink-0 pt-0.5 text-xs text-muted-foreground tabular">
          {item.grams} g · <span className="font-semibold text-foreground">{item.kcal}</span> kcal
        </p>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        {units.length > 1 ? (
          <div role="group" aria-label={`Enhet för ${item.name}`} className="inline-flex rounded-full bg-black/30 p-0.5 ring-1 ring-white/10">
            {units.map((u) => {
              const active = u === unit
              return (
                <button
                  key={u}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange(switchUnit(item, u))}
                  className={cn(
                    "relative h-8 min-w-11 rounded-full px-3 text-xs font-semibold transition-colors before:absolute before:inset-x-0 before:-inset-y-1.5",
                    active ? "text-brand-foreground" : "text-muted-foreground hover:text-foreground",
                    FOCUS
                  )}
                >
                  {active && <motion.span layoutId={`bento-unit-${item.name}`} transition={SPRING} className="absolute inset-0 rounded-full bg-brand" />}
                  <span className="relative">{u}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <span className="inline-flex h-8 min-w-11 items-center justify-center rounded-full bg-white/[0.06] px-3 text-xs font-semibold ring-1 ring-white/10">{unit}</span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <StepButton label={`Minska ${item.name}`} disabled={amount <= step} onClick={() => onChange(setAmount(item, Math.max(step, amount - step), unit))}>
            <Minus aria-hidden className="size-3.5" />
          </StepButton>
          <span className="relative grid h-6 w-14 place-items-center overflow-hidden text-sm font-semibold tabular">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={label}
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -12, opacity: 0 }}
                transition={{ duration: 0.22, ease: EASE }}
                aria-hidden
              >
                {label}
              </motion.span>
            </AnimatePresence>
            <span className="sr-only">
              {item.name}: {label}
            </span>
          </span>
          <StepButton label={`Öka ${item.name}`} disabled={amount >= MAX[unit]} onClick={() => onChange(setAmount(item, Math.min(MAX[unit], amount + step), unit))}>
            <Plus aria-hidden className="size-3.5" />
          </StepButton>
        </div>
      </div>
    </li>
  )
}

/** Kalorier mot dagens mål som en ring som fylls. */
function KcalRing({ value, start }: { value: number; start: boolean }) {
  const reduce = useReducedMotion()
  const pct = Math.min(1, value / TARGETS.kcal)
  return (
    <div role="img" aria-label={`${Math.round(value)} av ${TARGETS.kcal} kcal`} className="relative grid size-24 shrink-0 place-items-center">
      <svg viewBox="0 0 100 100" aria-hidden className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r="42" fill="none" strokeWidth="8" className="stroke-white/10" />
        <motion.circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          className="stroke-brand"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: start ? pct : 0 }}
          transition={reduce ? { duration: 0 } : SOFT_SPRING}
        />
      </svg>
      <div aria-hidden className="relative text-center leading-none">
        <AnimatedNumber value={value} start={start} className="text-xl font-bold" />
        <p className="mt-1 text-[10px] text-muted-foreground">kcal</p>
      </div>
    </div>
  )
}

/** Demo: Dagens kost med riktiga enheter (switchUnit/setAmount) och makron som räknas om. */
function NutritionDemo() {
  const ref = React.useRef<HTMLDivElement>(null)
  const live = useLive(ref)
  const seen = useInView(ref, { once: true, amount: 0.25 })
  const [items, setItems] = React.useState<MealItem[]>(START_ITEMS)
  const [plan, setPlan] = React.useState<PlanKey>("elin")
  const [message, setMessage] = React.useState("")
  const [showAll, setShowAll] = React.useState(false)
  const listId = React.useId()
  const moreCount = items.length - MOBILE_FOODS
  const total = sumMacros(items)

  const update = (index: number, next: MealItem) => {
    const list = items.map((it, i) => (i === index ? next : it))
    const t = sumMacros(list)
    setItems(list)
    const unit = next.unit ?? "g"
    setMessage(`${next.name}: ${sv(amountOf(next))} ${unit}${unit === "g" ? "" : ` (${next.grams} g)`}, ${next.kcal} kcal. Totalt ${Math.round(t.kcal)} kcal.`)
  }

  // justify-evenly: när kortet sträcks ut (två rader på surfplatta) fördelas luften jämnt i stället för ett stort hål.
  return (
    <div ref={ref} className="flex flex-1 flex-col justify-evenly gap-4">
      <div className={cn(PANEL, "p-3 sm:p-3.5")}>
        <div className="flex items-center justify-between gap-2 px-0.5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Utensils aria-hidden className="size-4 text-brand" />
            Dagens kost
          </p>
          <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] text-muted-foreground">mot dina mål</span>
        </div>
        <div aria-hidden className="mt-3 flex h-11 items-center gap-2.5 rounded-xl border border-white/10 bg-black/30 pr-1.5 pl-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">Sök livsmedel eller skanna streckkod</span>
          <span className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg bg-brand/10 text-brand ring-1 ring-brand/25">
            <ScanBarcode className="size-4" />
            {live && (
              <motion.span
                className="absolute inset-x-1 top-1/2 h-px bg-brand shadow-[0_0_8px_1px] shadow-brand"
                animate={{ y: [-10, 10, -10] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
          </span>
        </div>
        <p className="mt-1.5 px-0.5 text-[11px] text-muted-foreground">Livsmedel och streckkoder från Open Food Facts</p>
        <LayoutGroup id="bento-units">
          {/* Mobil: två rader syns direkt, resten fälls ut. Totalen räknar alltid med alla livsmedel. */}
          <ul id={listId} className="mt-3 flex flex-col gap-2" aria-label="Loggade livsmedel">
            {items.map((item, i) => (
              <FoodRow key={item.name} item={item} className={!showAll && i >= MOBILE_FOODS ? "hidden sm:block" : undefined} onChange={(next) => update(i, next)} />
            ))}
          </ul>
        </LayoutGroup>
        {moreCount > 0 && (
          <button
            type="button"
            aria-expanded={showAll}
            aria-controls={listId}
            onClick={() => setShowAll((s) => !s)}
            className={cn(
              "mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-white/15 text-xs font-medium text-muted-foreground transition-colors hover:border-white/25 hover:text-foreground sm:hidden",
              FOCUS
            )}
          >
            {showAll ? "Visa färre" : `Visa ${moreCount} livsmedel till`}
            <ChevronDown aria-hidden className={cn("size-3.5 transition-transform duration-300", showAll && "rotate-180")} />
          </button>
        )}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-4 rounded-2xl border border-white/[0.07] bg-gradient-to-br from-brand/[0.08] to-transparent p-3.5">
          <KcalRing value={total.kcal} start={seen} />
          <div className="min-w-[10rem] flex-1 space-y-2.5">
            {MACROS.map((m) => {
              const v = total[m.key]
              const target = TARGETS[m.key]
              return (
                <div key={m.key}>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <MacroDot macro={m.key} />
                      <span className="truncate">{m.label}</span>
                    </span>
                    <span className="shrink-0">
                      <AnimatedNumber value={v} start={seen} className="font-semibold" />
                      <span className="text-muted-foreground"> / {target} g</span>
                    </span>
                  </div>
                  <div aria-hidden className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <motion.div
                      className={cn("h-full origin-left rounded-full", m.dot)}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: seen ? Math.min(1, v / target) : 0 }}
                      transition={SOFT_SPRING}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-brand/20 bg-brand/[0.06] p-3.5">
        <p className="flex items-center gap-2 text-xs font-semibold text-brand">
          <LockKeyhole aria-hidden className="size-3.5" />1 kostschema-regeln
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Ett aktivt kostschema åt gången – även med flera PT:er. Du väljer vilket, de andra sparas som förslag.
        </p>
        <div role="group" aria-label="Välj aktivt kostschema" className="mt-3 grid grid-cols-2 gap-2">
          {PLANS.map((p) => {
            const active = plan === p.key
            return (
              <button
                key={p.key}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setPlan(p.key)
                  setMessage(`Kostschemat från ${p.name} är nu aktivt. Det andra sparas som förslag.`)
                }}
                className={cn("relative flex min-h-12 items-center gap-2 rounded-xl px-2.5 py-2 text-left ring-1 ring-white/10 transition-colors hover:bg-white/[0.04]", FOCUS)}
              >
                {active && <motion.span layoutId="bento-active-plan" transition={SPRING} className="absolute inset-0 rounded-xl bg-white/[0.07] ring-1 ring-brand/50" />}
                <Initials name={p.name} muted={!active} className="relative size-7 text-[10px]" />
                <span className="relative min-w-0">
                  <span className="block truncate text-xs font-semibold">{p.name}</span>
                  <span className={cn("block text-[11px]", active ? "text-brand" : "text-muted-foreground")}>{active ? "Aktivt" : "Förslag"}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <p aria-live="polite" className="sr-only">
        {message}
      </p>
    </div>
  )
}

// -------------------------------------------------- 3. Kalender ---

const CAL_DAYS = ["Mån", "Tis", "Ons", "Tor", "Fre"] as const
const CAL_DAYS_LONG = ["måndag", "tisdag", "onsdag", "torsdag", "fredag"] as const
const CAL_TIMES = ["07:00", "12:00", "17:30"] as const
/** Redan bokade pass: "dag-tid". */
const BOOKED = new Set(["0-0", "1-2", "2-1", "3-0"])
const NEXT_SLOT = "4-2"
const NEXT_LABEL = `${CAL_DAYS_LONG[4]} ${CAL_TIMES[2]}`
/** Exempel: klienten har köpt fem pass. */
const PAID = 5
const CALENDARS = ["Google Kalender", "Outlook", "Apple Kalender"] as const

function CalCell({ booked, target, locked, fresh, live }: { booked: boolean; target: boolean; locked: boolean; fresh: boolean; live: boolean }) {
  return (
    <div className="relative h-11 sm:h-12">
      <AnimatePresence initial={false} mode="popLayout">
        {booked ? (
          <motion.div
            key="booked"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: "spring", stiffness: 460, damping: 20 }}
            className="absolute inset-0 flex items-center justify-center gap-1 rounded-lg bg-brand text-brand-foreground shadow-[0_6px_20px_-8px] shadow-brand/80"
          >
            <Dumbbell aria-hidden className="size-3.5" />
            <span className="hidden text-[10px] font-bold sm:inline">Pass</span>
          </motion.div>
        ) : (
          <motion.div
            key="free"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "absolute inset-0 grid place-items-center rounded-lg border border-dashed",
              target && !locked ? "border-brand/60 bg-brand/[0.07]" : "border-white/10 bg-white/[0.015]"
            )}
          >
            {locked ? <Lock aria-hidden className="size-3 text-muted-foreground/70" /> : target ? <Plus aria-hidden className="size-3.5 text-brand" /> : null}
          </motion.div>
        )}
      </AnimatePresence>
      {target && !booked && live && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-brand/70"
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      {fresh && booked && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-brand"
          initial={{ scale: 1, opacity: 0.9 }}
          animate={{ scale: 1.7, opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      )}
    </div>
  )
}

/** Demo: boka sista betalda passet → passgränsen nådd → låst. Synkas till kalendrarna. */
function CalendarDemo() {
  const ref = React.useRef<HTMLDivElement>(null)
  const bookRef = React.useRef<HTMLButtonElement>(null)
  const reduce = useReducedMotion()
  const live = useLive(ref)
  const [booked, setBooked] = React.useState(false)
  const [sync, setSync] = React.useState(0)
  const [message, setMessage] = React.useState("")
  const shakeX = useMotionValue(0)
  const count = BOOKED.size + (booked ? 1 : 0)
  const full = count >= PAID

  const book = () => {
    if (full) {
      if (!reduce) void animate(shakeX, [0, -7, 7, -5, 5, -2, 0], { duration: 0.45, ease: "easeInOut" })
      setMessage("Passgränsen är nådd. Det går inte att boka fler pass än det som är betalt – köp fler pass först.")
      return
    }
    setBooked(true)
    setSync((s) => s + 1)
    setMessage(`Pass bokat ${NEXT_LABEL} och synkat till kalendern. ${PAID} av ${PAID} pass bokade.`)
  }

  const reset = () => {
    setBooked(false)
    setMessage(`Kalendern är återställd. ${BOOKED.size} av ${PAID} pass bokade.`)
    bookRef.current?.focus()
  }

  return (
    <div ref={ref} className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className={cn(PANEL, "p-3 sm:p-4")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <CalendarDays aria-hidden className="size-4 text-brand" />
            Den här veckan
          </p>
          <span aria-hidden className="flex rounded-full bg-black/30 p-0.5 text-[10px] font-medium ring-1 ring-white/10">
            <span className="px-2 py-0.5 text-muted-foreground">Månad</span>
            <span className="rounded-full bg-white/10 px-2 py-0.5">Vecka</span>
            <span className="px-2 py-0.5 text-muted-foreground">Dag</span>
          </span>
        </div>
        <div
          role="img"
          aria-label={`Veckokalender med ${count} bokade pass. ${full ? "Alla betalda pass är bokade." : `Nästa lediga tid: ${NEXT_LABEL}.`}`}
          className="mt-3 grid grid-cols-[2.4rem_repeat(5,minmax(0,1fr))] gap-1.5"
        >
          <span />
          {CAL_DAYS.map((d) => (
            <span key={d} className="pb-0.5 text-center text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              {d}
            </span>
          ))}
          {CAL_TIMES.map((t, ti) => (
            <React.Fragment key={t}>
              <span className="self-center text-[10px] text-muted-foreground tabular">{t}</span>
              {CAL_DAYS.map((d, di) => {
                const id = `${di}-${ti}`
                const isNext = id === NEXT_SLOT
                return <CalCell key={d} booked={BOOKED.has(id) || (booked && isNext)} target={isNext} locked={full} fresh={isNext} live={live} />
              })}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className={cn(PANEL, "p-4")}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold">Passgräns</p>
            <p className="text-sm text-muted-foreground tabular">
              <span className="relative inline-grid h-7 w-5 place-items-center overflow-hidden align-bottom text-2xl font-bold text-foreground">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={count}
                    initial={{ y: 18, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -18, opacity: 0 }}
                    transition={{ duration: 0.3, ease: EASE }}
                  >
                    {count}
                  </motion.span>
                </AnimatePresence>
              </span>{" "}
              av {PAID} pass bokade
            </p>
          </div>
          <div aria-hidden className="mt-3 grid grid-cols-5 gap-1.5">
            {Array.from({ length: PAID }, (_, i) => (
              <div key={i} className="h-2 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className={cn("h-full origin-left rounded-full transition-colors duration-500", full ? "bg-warning" : "bg-brand")}
                  initial={false}
                  animate={{ scaleX: i < count ? 1 : 0 }}
                  transition={SOFT_SPRING}
                />
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-xs text-muted-foreground">Det går aldrig att boka fler pass än det som är betalt.</p>
          <motion.button
            ref={bookRef}
            type="button"
            style={{ x: shakeX }}
            whileTap={full ? undefined : { scale: 0.97 }}
            onClick={book}
            aria-disabled={full}
            className={cn(
              full
                ? "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white/[0.05] px-4 py-2 text-sm font-semibold text-foreground ring-1 ring-warning/50"
                : PRIMARY_BTN,
              "mt-3 w-full",
              FOCUS
            )}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={full ? "full" : "open"}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="flex items-center gap-2 text-left"
              >
                {full ? <Lock aria-hidden className="size-4 shrink-0 text-warning" /> : <CalendarCheck aria-hidden className="size-4 shrink-0" />}
                {full ? "Passgränsen nådd – köp fler pass" : `Boka ${NEXT_LABEL}`}
              </motion.span>
            </AnimatePresence>
          </motion.button>
          <AnimatePresence initial={false}>
            {full && (
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3, ease: EASE }}>
                <button type="button" onClick={reset} className={cn("mt-2 inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-xs font-medium text-muted-foreground hover:text-foreground", FOCUS)}>
                  <RotateCcw aria-hidden className="size-3.5" />
                  Börja om
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link2 aria-hidden className="size-3.5" />
            Synkas via prenumerationslänk – ändringar uppdateras automatiskt
          </p>
          <ul className="mt-2.5 flex flex-wrap gap-2" aria-label="Kalendrar som kan synkas">
            {CALENDARS.map((c, i) => (
              <li key={c} className="relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium">
                {sync > 0 && (
                  <motion.span
                    key={sync}
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-brand/25"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ duration: 1.1, delay: 0.35 + i * 0.15, ease: "easeInOut" }}
                  />
                )}
                <span aria-hidden className="relative flex size-2">
                  {live && (
                    <motion.span
                      className="absolute inset-0 rounded-full bg-brand"
                      animate={{ scale: [1, 2.6], opacity: [0.6, 0] }}
                      transition={{ duration: 2, repeat: Infinity, delay: i * 0.5, ease: "easeOut" }}
                    />
                  )}
                  <span className="relative size-2 rounded-full bg-brand" />
                </span>
                <span className="relative">{c}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p aria-live="polite" className="sr-only">
        {message}
      </p>
    </div>
  )
}

// ------------------------------------------------- 4. Säkerhet ---

const CHECKS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: FileCheck, title: "Certifikat granskat", text: `Manuellt, via ${BRAND.certificationEmail}` },
  { icon: UserCheck, title: "PT-konto skapat av Coavira", text: "Ingen kan registrera sig själv som PT" },
  { icon: KeyRound, title: "E-post + lösenord", text: "Enda sättet att logga in som PT" },
]

/** Sköld med pulserande ringar. */
function Shield({ live }: { live: boolean }) {
  return (
    <div aria-hidden className="relative grid size-20 shrink-0 place-items-center">
      {live &&
        [0, 1].map((i) => (
          <motion.span
            key={i}
            className="absolute inset-0 rounded-[1.6rem] border border-brand/50"
            initial={{ scale: 1, opacity: 0 }}
            animate={{ scale: [1, 1.45], opacity: [0.7, 0] }}
            transition={{ duration: 2.6, repeat: Infinity, delay: i * 1.3, ease: "easeOut" }}
          />
        ))}
      <div className="relative grid size-20 place-items-center rounded-[1.6rem] border border-brand/30 bg-gradient-to-b from-brand/25 to-emerald-500/5 shadow-[0_0_50px_-12px] shadow-brand/70">
        <ShieldCheck className="size-9 text-brand" strokeWidth={1.75} />
      </div>
    </div>
  )
}

/** En punkt i granskningen som bockas av i tur och ordning. */
function CheckRow({ icon: Icon, title, text, index, active }: { icon: LucideIcon; title: string; text: string; index: number; active: boolean }) {
  const reduce = useReducedMotion()
  const delay = 0.35 + index * 0.45
  return (
    <li className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.05] text-muted-foreground">
        <Icon aria-hidden className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs [overflow-wrap:anywhere] text-muted-foreground">{text}</span>
      </span>
      <motion.span
        aria-hidden
        className="grid size-6 shrink-0 place-items-center rounded-full bg-brand text-brand-foreground"
        initial={{ scale: 0, opacity: 0 }}
        animate={active ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 24, delay }}
      >
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <motion.path
            d="M5 12.5l4.5 4.5L19 7.5"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: active ? 1 : 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.35, delay: delay + 0.12, ease: EASE }}
          />
        </svg>
      </motion.span>
    </li>
  )
}

/** Demo: verifierad PT-profil och granskningen som bockas av. Kan spelas upp igen. */
function SecurityDemo() {
  const ref = React.useRef<HTMLDivElement>(null)
  const live = useLive(ref)
  const seen = useInView(ref, { once: true, amount: 0.35 })
  const [run, setRun] = React.useState(0)
  return (
    <div ref={ref} className="flex flex-1 flex-col gap-4">
      <div className="flex items-center gap-4">
        <Shield live={live} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Elin Söderberg</p>
          <p className="text-xs text-muted-foreground">Personlig tränare</p>
          <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand ring-1 ring-brand/25">
            <BadgeCheck aria-hidden className="size-3.5" />
            Verifierad PT
          </span>
        </div>
      </div>
      <ul key={run} className="space-y-2" aria-label="Så verifieras en PT">
        {CHECKS.map((c, i) => (
          <CheckRow key={c.title} {...c} index={i} active={seen} />
        ))}
      </ul>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
        <a href={LINKS.ptApply} className={cn("inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold text-brand underline-offset-4 hover:underline", FOCUS)}>
          <Mail aria-hidden className="size-4" />
          Är du PT? Skicka in ditt certifikat
          <span className="sr-only"> (öppnar e-post till {BRAND.certificationEmail})</span>
        </a>
        <button type="button" onClick={() => setRun((r) => r + 1)} aria-label="Spela upp granskningen igen" className={cn("grid size-11 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground", FOCUS)}>
          <RotateCcw aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  )
}

// ------------------------------------------------- 5. Betalning ---

/** Exempelpris för helhetspaketet – samma som Helhetspaket under Priser (EXAMPLE_PRICES.full i pricing.tsx). */
const EXAMPLE_FULL_PRICE = 6995

/** Demo: betalkort som vänds och visar köpet (exempelpris). */
function PaymentDemo() {
  const [flipped, setFlipped] = React.useState(false)
  const price = formatSek(EXAMPLE_FULL_PRICE)
  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* Kortet centreras i ytan som blir över – Stripe-raden ligger kvar längst ned. */}
      <div className="flex flex-1 items-center justify-center pt-9 pb-1">
        <div className="relative w-full max-w-[360px] [perspective:1000px]">
          {/* Kvittot sticker upp snett bakom kortet och ger djup (dekor – köpet visas på kortets baksida). */}
          <div
            aria-hidden
            className="absolute inset-x-5 -top-8 h-24 -rotate-3 rounded-xl border border-white/10 bg-[#141b24] px-3.5 pt-2.5 shadow-xl shadow-black/40"
          >
            <div className="flex items-center justify-between text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
              <span>Kvitto</span>
              <span className="inline-flex items-center gap-1 text-brand">
                <Check className="size-3" />
                Betalt
              </span>
            </div>
          </div>
          <motion.div
            className="relative aspect-[1.586/1] w-full [transform-style:preserve-3d]"
            initial={false}
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={{ type: "spring", stiffness: 120, damping: 17 }}
          >
            <div
              aria-hidden
              className="absolute inset-0 overflow-hidden rounded-2xl border border-white/15 bg-[linear-gradient(135deg,#22331a_0%,#111c16_45%,#070d0b_100%)] p-4 shadow-2xl shadow-black/60 [backface-visibility:hidden] sm:p-5"
            >
              <div className="absolute -top-16 -right-12 size-44 rounded-full bg-brand/25 blur-3xl" />
              <div className="absolute -bottom-20 -left-10 size-40 rounded-full bg-emerald-400/10 blur-3xl" />
              <div className="relative flex h-full flex-col justify-between">
                <div className="flex items-start justify-between">
                  <span className="text-[11px] font-semibold tracking-wider text-white/70 uppercase">Kort</span>
                  <Wifi className="size-5 rotate-90 text-white/70" />
                </div>
                <div className="h-7 w-10 rounded-md bg-gradient-to-br from-white/70 to-white/25 ring-1 ring-white/30" />
                <div>
                  <p className="font-mono text-[13px] tracking-[0.2em] text-white/90 sm:text-sm">•••• •••• •••• 4242</p>
                  <div className="mt-1.5 flex justify-between text-[10px] tracking-wider text-white/60 uppercase">
                    <span>Sara Lindqvist</span>
                    <span className="tabular">09/29</span>
                  </div>
                </div>
              </div>
            </div>
            <div
              aria-hidden={!flipped}
              className="absolute inset-0 flex flex-col rounded-2xl border border-white/15 bg-[#0d1218] p-4 shadow-2xl shadow-black/60 [backface-visibility:hidden] [transform:rotateY(180deg)] sm:p-5"
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Ditt köp</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-semibold text-brand">
                  <Check aria-hidden className="size-3" />
                  Betalt
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold">Helhetspaket · träning + kost</p>
              <p className="text-xs text-muted-foreground">hos Elin Söderberg</p>
              <dl className="mt-auto space-y-1 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Pris (t.ex.)</dt>
                  <dd className="tabular">{price}</dd>
                </div>
                <div className="flex justify-between gap-2 border-t border-white/10 pt-1 font-semibold">
                  <dt>Du betalar</dt>
                  <dd className="text-brand tabular">{price}</dd>
                </div>
              </dl>
            </div>
          </motion.div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock aria-hidden className="size-3.5 text-brand" />
          Kortbetalning via Stripe
        </span>
        <button type="button" onClick={() => setFlipped((f) => !f)} className={cn(GHOST_BTN, FOCUS)}>
          <RotateCcw aria-hidden className="size-4" />
          {flipped ? "Visa kortet" : "Visa köpet"}
        </button>
      </div>
    </div>
  )
}

// --------------------------------------------- 6. Anslutningar ---

/** Källor runt Coavira-märket (position i procent av den kvadratiska ytan). */
const SOURCES: { label: string; icon: LucideIcon; x: number; y: number }[] = [
  { label: "Apple Health", icon: Heart, x: 25, y: 18 },
  { label: "Garmin", icon: Watch, x: 75, y: 18 },
  { label: "Strava", icon: Activity, x: 50, y: 84 },
]
/** SVG-ytan är 400 × 400 (samma proportioner som rutan), så procent → koordinat är × 4 och mitten 200. */
const HUB = 200

/** Id för källans egen gradient (i användarkoordinater, så att även en lodrät linje målas). */
const connId = (label: string) => `bento-conn-${label.replace(/\s/g, "")}`

/**
 * Demo: datakällor kopplade till Coavira med ljuspunkter som rör sig mot mitten.
 * Diagrammet är kvadratiskt och centreras i ytan som blir över, med app-raden
 * längst ned i linje med de andra korten i raden.
 */
function ConnectionsDemo() {
  const ref = React.useRef<HTMLDivElement>(null)
  const live = useLive(ref)
  return (
    <div ref={ref} className="flex flex-1 flex-col">
      <div className="relative m-auto aspect-square w-full max-w-[320px] lg:max-w-none">
        <svg aria-hidden viewBox="0 0 400 400" className="absolute inset-0 size-full">
          <defs>
            {SOURCES.map((s) => (
              <linearGradient key={s.label} id={connId(s.label)} gradientUnits="userSpaceOnUse" x1={s.x * 4} y1={s.y * 4} x2={HUB} y2={HUB}>
                <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.15" />
                <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.7" />
              </linearGradient>
            ))}
          </defs>
          {/* Svaga banor runt navet ger djup. */}
          <circle cx={HUB} cy={HUB} r={96} fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth={1} />
          <circle cx={HUB} cy={HUB} r={156} fill="none" stroke="rgb(255 255 255 / 0.05)" strokeWidth={1} strokeDasharray="2 7" />
          {SOURCES.map((s) => (
            <line
              key={s.label}
              x1={s.x * 4}
              y1={s.y * 4}
              x2={HUB}
              y2={HUB}
              stroke={`url(#${connId(s.label)})`}
              strokeWidth={1.5}
              strokeDasharray="3 6"
              strokeLinecap="round"
            />
          ))}
          {live &&
            SOURCES.map((s, i) => (
              <motion.circle
                key={s.label}
                r={4}
                fill="var(--brand)"
                initial={{ cx: s.x * 4, cy: s.y * 4, opacity: 0 }}
                animate={{ cx: [s.x * 4, HUB], cy: [s.y * 4, HUB], opacity: [0, 1, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 0.8, delay: i * 0.6, ease: "easeInOut" }}
              />
            ))}
        </svg>
        <div aria-hidden className="absolute top-1/2 left-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center">
          {live && (
            <motion.span
              className="absolute inset-0 rounded-2xl bg-brand/40"
              animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
            />
          )}
          <span className="relative grid size-16 place-items-center rounded-2xl bg-brand text-brand-foreground shadow-[0_0_40px_-6px] shadow-brand/80">
            <BrandGlyph className="size-9" />
          </span>
        </div>
        <ul aria-label="Anslutningar">
          {SOURCES.map(({ label, icon: Icon, x, y }) => (
            <li
              key={label}
              style={{ left: `${x}%`, top: `${y}%` }}
              className="absolute inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border border-white/10 bg-[#11161d]/95 px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap shadow-lg shadow-black/40"
            >
              <Icon aria-hidden className="size-3.5 text-brand" />
              {label}
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">I Coavira-appen för iPhone och Android</p>
    </div>
  )
}

// ------------------------------------------------------- sektionen ---

/** Mjuka gröna sken bakom rutnätet som glider i otakt med scrollen (parallax). */
function Backdrop() {
  const ref = React.useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] })
  const y1 = useTransform(scrollYProgress, [0, 1], [-80, 80])
  const y2 = useTransform(scrollYProgress, [0, 1], [100, -100])
  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0">
      <motion.div style={reduce ? undefined : { y: y1 }} className="absolute inset-x-0 top-[6%] h-80">
        <GlowOrb className="top-0 left-[8%] h-72 w-72 opacity-70" />
      </motion.div>
      <motion.div style={reduce ? undefined : { y: y2 }} className="absolute inset-x-0 bottom-[8%] h-80">
        <GlowOrb className="right-[6%] bottom-0 h-80 w-80 bg-emerald-500/15" />
      </motion.div>
    </div>
  )
}

/** Kort i den svepbara raden på mobil: 85 % bred så att nästa kort syns. Vanlig rutnätscell från md. */
const SWIPE_CARD = "w-[85%] shrink-0 snap-start md:w-auto"

/** Sektionen "Funktioner": bento-rutnätet med sex levande kort och en uppmaning under. */
export function FeatureBento() {
  return (
    <Section
      id="funktioner"
      eyebrow="Funktioner"
      title={
        <>
          Allt du behöver. <GradientText>Inget du inte behöver.</GradientText>
        </>
      }
      intro="Pass, kost, kalender och betalning i ett och samma flöde – för PT:n som coachar och klienten som kör. Testa själv – byt, boka och klarmarkera direkt i korten."
    >
      <div className="relative">
        <Backdrop />
        <div className="relative grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          <BentoCard
            className="md:col-span-2"
            icon={Dumbbell}
            kicker="PT + klient"
            title="PT & klient i synk"
            tilt={3}
            text="PT:n bygger passet – uppvärmning, huvudpass, nedvarvning – och det dyker upp hos klienten direkt. Klarmarkering först när passet är genomfört och vikterna ifyllda. PT:n styr passen, klienten har full koll på sin resa."
          >
            <SyncDemo />
          </BentoCard>
          <BentoCard
            className="md:row-span-2"
            icon={Utensils}
            kicker="Kost"
            title="Exklusivt kostschema"
            tilt={3}
            delay={0.08}
            text="Sök bland livsmedel från Open Food Facts eller skanna streckkoden. Varje livsmedel får logiska enheter – och makrona räknas om direkt."
          >
            <NutritionDemo />
          </BentoCard>
          <BentoCard
            className="lg:col-span-2"
            icon={CalendarDays}
            kicker="Kalender"
            title="Kalendersynk & passgräns"
            tilt={3}
            text="Boka och flytta pass i månads-, vecko- eller dagsvy och synka till Google Kalender, Outlook och Apple Kalender. Passgränsen gör att det aldrig bokas fler pass än det som är betalt."
          >
            <CalendarDemo />
          </BentoCard>
          {/*
            Mobil: de tre sista korten ligger i en svepbar rad där nästa kort sticker fram,
            i stället för tre skärmar till med staplade kort. Från md är raden "display: contents"
            och korten ligger i rutnätet igen. På md flyttas Trygghet och Anslutningar sist (order),
            så att det höga kostkortet paras med det korta betalkortet i stället för att sträckas ut.
          */}
          <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto overflow-y-hidden px-4 py-1 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 md:contents [&::-webkit-scrollbar]:hidden">
            <BentoCard
              className={cn(SWIPE_CARD, "md:order-1 lg:order-none")}
              icon={ShieldCheck}
              kicker="Trygghet"
              title="Verifierade PT:er. Skyddad data."
              text="Varje PT-konto skapas av Coavira – först när certifikaten granskats manuellt. Hälsodata hanteras bara med ditt uttryckliga samtycke och lagras inom EU."
            >
              <SecurityDemo />
            </BentoCard>
            <BentoCard
              className={SWIPE_CARD}
              icon={CreditCard}
              kicker="Betalning"
              title="Säker kortbetalning"
              delay={0.08}
              text="Köp PT:ns pass, program, kostcoaching eller helhetspaket med kort via Stripe. PT:n sätter priset – och priset du ser är priset du betalar."
            >
              <PaymentDemo />
            </BentoCard>
            <BentoCard
              className={cn(SWIPE_CARD, "md:order-2 lg:order-none")}
              icon={Plug}
              kicker="Anslutningar"
              title="Koppla dina appar"
              delay={0.16}
              text="Anslut Apple Health, Garmin och Strava till ditt Coavira-konto."
            >
              <ConnectionsDemo />
            </BentoCard>
          </div>
        </div>

        <Reveal className="relative mt-8 flex flex-col items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-center backdrop-blur-md sm:mt-10 sm:flex-row sm:p-6 sm:text-left">
          <p className="text-pretty text-muted-foreground">
            <span className="font-semibold text-foreground">Redo att köra?</span> Ladda ned Coavira gratis till iPhone eller Android.
          </p>
          <StoreBadges align="center" className="shrink-0" />
        </Reveal>
      </div>
    </Section>
  )
}
