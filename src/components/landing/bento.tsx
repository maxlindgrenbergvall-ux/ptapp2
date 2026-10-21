"use client"

/**
 * Funktionssektionen (#funktioner): ett bento-rutnät med levande mini-demos –
 * PT & klient i synk, kostschema med appens riktiga enhetslogik, kalender med
 * passgräns, verifierade PT:er, kortbetalning och anslutningar. Allt styrs med
 * tangentbord, loopar körs bara när kortet syns och står still med
 * "minska rörelse".
 */
import { animate, AnimatePresence, LayoutGroup, motion, useInView, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from "framer-motion"
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  CalendarDays,
  Check,
  CreditCard,
  Download,
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
  Server,
  ShieldCheck,
  UserCheck,
  Utensils,
  Watch,
  Wifi,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { BrandGlyph } from "@/components/brand"
import { LINKS } from "@/components/landing/links"
import { EASE, GlassCard, GlowOrb, GradientText, GridBackdrop, PhoneFrame, Reveal, Section, TiltCard, useConfetti } from "@/components/landing/primitives"
import { MACROS, MacroDot, sumMacros } from "@/components/nutrition/macros"
import { BRAND } from "@/lib/brand"
import { FOODS } from "@/lib/foods"
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

/** Levande loopar körs bara när elementet syns och rörelse är tillåten. */
function useLive(ref: React.RefObject<Element | null>) {
  const reduce = useReducedMotion()
  const inView = useInView(ref, { margin: "-10% 0px" })
  return inView && !reduce
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
    <Reveal delay={delay} className={cn("min-w-0", className)}>
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
          <div className="relative">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-xl bg-brand/10 text-brand ring-1 ring-brand/25">
                <Icon aria-hidden className="size-[18px]" />
              </span>
              <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{kicker}</span>
            </div>
            <h3 className="mt-4 text-2xl leading-tight font-bold tracking-tight text-balance sm:text-[1.75rem]">{title}</h3>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-pretty text-muted-foreground">{text}</p>
          </div>
          <div className="relative mt-6 flex flex-1 flex-col">{children}</div>
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

/** Ljusstråle mellan PT-panelen och klientens telefon; `pulse` skickar en extra ljuspuls. */
function Beam({ pulse, live, axis }: { pulse: number; live: boolean; axis: "x" | "y" }) {
  const horizontal = axis === "x"
  const dot = "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
  return (
    <div aria-hidden className={cn("relative", horizontal ? "h-px w-full" : "h-14 w-px")}>
      <div className={cn("absolute inset-0 rounded-full from-brand/10 via-brand/70 to-brand/10", horizontal ? "bg-gradient-to-r" : "bg-gradient-to-b")} />
      <span className={cn("absolute size-2 rounded-full bg-brand shadow-[0_0_12px_2px] shadow-brand/60", horizontal ? "top-1/2 -left-1 -translate-y-1/2" : "-top-1 left-1/2 -translate-x-1/2")} />
      <span className={cn("absolute size-2 rounded-full bg-brand shadow-[0_0_12px_2px] shadow-brand/60", horizontal ? "top-1/2 -right-1 -translate-y-1/2" : "-bottom-1 left-1/2 -translate-x-1/2")} />
      {live && (
        <motion.div
          className="absolute inset-0"
          initial={horizontal ? { x: "-50%" } : { y: "-50%" }}
          animate={horizontal ? { x: ["-50%", "50%"] } : { y: ["-50%", "50%"] }}
          transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 0.5, ease: "easeInOut" }}
        >
          <span className={cn("absolute size-1.5 rounded-full bg-white shadow-[0_0_10px_3px] shadow-brand/70", dot)} />
        </motion.div>
      )}
      {pulse > 0 && (
        <motion.div
          key={pulse}
          className="absolute inset-0"
          initial={horizontal ? { x: "-50%", opacity: 0 } : { y: "-50%", opacity: 0 }}
          animate={horizontal ? { x: "50%", opacity: [0, 1, 1, 0] } : { y: "50%", opacity: [0, 1, 1, 0] }}
          transition={{ duration: 0.9, ease: EASE }}
        >
          <span className={cn("absolute size-3 rounded-full bg-brand shadow-[0_0_24px_8px] shadow-brand/70", dot)} />
        </motion.div>
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
          <Check aria-hidden className="size-3 text-brand" />
          Vikter ifyllda
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

/** Klientens telefon: samma pass, synkat. Dold för skärmläsare – ändringarna läses upp via demons statusrad. */
function ClientPhone({ step, pulse }: { step: SyncStep; pulse: number }) {
  return (
    <div aria-hidden className="flex justify-center">
      <PhoneFrame className="w-[248px] sm:w-[256px]" time="06:58">
        <div className="flex h-[372px] flex-col gap-2.5 px-3.5 pt-2 pb-4">
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
                <span className="absolute inset-0 animate-ping rounded-full bg-brand/70 motion-reduce:animate-none" />
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
                <p className="text-[10px] text-muted-foreground tabular">07:00 · med Elin</p>
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
          <div aria-hidden className={cn("flex items-center justify-around rounded-2xl border border-border bg-card/80 py-2 text-muted-foreground", step !== 2 && "mt-auto")}>
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

  const goTo = React.useCallback((next: SyncStep) => {
    setStep(next)
    if (next > 0) setPulse((p) => p + 1)
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
    timers.current = [window.setTimeout(() => goTo(1), 1300), window.setTimeout(() => goTo(2), 3900)]
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
        <PtPanel step={step} />
        <div className="flex justify-center md:hidden">
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
function FoodRow({ item, onChange }: { item: MealItem; onChange: (next: MealItem) => void }) {
  const unit = item.unit ?? "g"
  const units = allowedUnits(item.name)
  const amount = amountOf(item)
  const step = STEP[unit]
  const label = `${sv(amount)} ${unit}`
  return (
    <li className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-2.5 sm:p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{item.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">{KIND_HINT[foodKind(item.name)]}</p>
        </div>
        <p className="shrink-0 pt-0.5 text-xs text-muted-foreground tabular">
          {item.grams} g · <span className="font-semibold text-foreground">{item.kcal}</span> kcal
        </p>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
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
        <div className="flex shrink-0 items-center gap-0.5">
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
  const total = sumMacros(items)

  const update = (index: number, next: MealItem) => {
    const list = items.map((it, i) => (i === index ? next : it))
    const t = sumMacros(list)
    setItems(list)
    setMessage(`${next.name}: ${sv(amountOf(next))} ${next.unit ?? "g"}, ${next.grams} g, ${next.kcal} kcal. Totalt ${Math.round(t.kcal)} kcal.`)
  }

  return (
    <div ref={ref} className="flex flex-1 flex-col gap-4">
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
          <ul className="mt-3 space-y-2" aria-label="Loggade livsmedel">
            {items.map((item, i) => (
              <FoodRow key={item.name} item={item} onChange={(next) => update(i, next)} />
            ))}
          </ul>
        </LayoutGroup>
        <div className="mt-3 flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-gradient-to-br from-brand/[0.08] to-transparent p-3.5">
          <KcalRing value={total.kcal} start={seen} />
          <div className="min-w-0 flex-1 space-y-2.5">
            {MACROS.map((m) => {
              const v = total[m.key]
              const target = TARGETS[m.key]
              return (
                <div key={m.key}>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5 truncate">
                      <MacroDot macro={m.key} />
                      {m.label}
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

      <div className="mt-auto rounded-2xl border border-brand/20 bg-brand/[0.06] p-3.5">
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
const PRIVACY: { icon: LucideIcon; label: string }[] = [
  { icon: Lock, label: "Hälsodata bara med samtycke" },
  { icon: Server, label: "Lagras inom EU" },
  { icon: Download, label: "Exportera & radera när du vill" },
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
      <ul className="flex flex-wrap gap-1.5" aria-label="Din data">
        {PRIVACY.map(({ icon: Icon, label }) => (
          <li key={label} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium">
            <Icon aria-hidden className="size-3 text-brand" />
            {label}
          </li>
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

/** Demo: betalkort som vänds och visar köpet (exempelpris). */
function PaymentDemo() {
  const [flipped, setFlipped] = React.useState(false)
  return (
    <div className="flex flex-1 flex-col justify-end gap-4">
      <div className="[perspective:1000px]">
        <motion.div
          className="relative mx-auto aspect-[1.586/1] w-full max-w-[340px] [transform-style:preserve-3d]"
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
                <dd className="tabular">2&nbsp;495 kr</dd>
              </div>
              <div className="flex justify-between gap-2 border-t border-white/10 pt-1 font-semibold">
                <dt>Du betalar</dt>
                <dd className="text-brand tabular">2&nbsp;495 kr</dd>
              </div>
            </dl>
          </div>
        </motion.div>
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

/** Källor runt Coavira-märket (position i procent av ytan 4:3). */
const SOURCES: { label: string; icon: LucideIcon; x: number; y: number }[] = [
  { label: "Apple Health", icon: Heart, x: 24, y: 16 },
  { label: "Garmin", icon: Watch, x: 76, y: 16 },
  { label: "Strava", icon: Activity, x: 50, y: 88 },
]

/** Demo: datakällor kopplade till Coavira med ljuspunkter som rör sig mot mitten. */
function ConnectionsDemo() {
  const ref = React.useRef<HTMLDivElement>(null)
  const live = useLive(ref)
  return (
    <div ref={ref} className="flex flex-1 flex-col justify-center">
      <div className="relative mx-auto aspect-[4/3] w-full max-w-[320px]">
        <svg aria-hidden viewBox="0 0 400 300" className="absolute inset-0 size-full">
          <defs>
            <linearGradient id="bento-conn" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.7" />
            </linearGradient>
          </defs>
          {SOURCES.map((s) => (
            <line key={s.label} x1={s.x * 4} y1={s.y * 3} x2={200} y2={150} stroke="url(#bento-conn)" strokeWidth={1.5} strokeDasharray="3 6" strokeLinecap="round" />
          ))}
          {live &&
            SOURCES.map((s, i) => (
              <motion.circle
                key={s.label}
                r={4}
                fill="var(--brand)"
                initial={{ cx: s.x * 4, cy: s.y * 3, opacity: 0 }}
                animate={{ cx: [s.x * 4, 200], cy: [s.y * 3, 150], opacity: [0, 1, 0] }}
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
      <p className="mt-4 text-center text-xs text-muted-foreground">iOS- och Android-app på väg</p>
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
      intro="Pass, kost, kalender och betalning i ett och samma flöde – för PT:n som coachar och klienten som kör. Klicka, byt och boka direkt i korten."
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
          <BentoCard
            icon={ShieldCheck}
            kicker="Trygghet"
            title="Verifierade PT:er. Skyddad data."
            text="Varje PT-konto skapas av Coavira – först när certifikaten granskats manuellt. Hälsodata hanteras bara med ditt uttryckliga samtycke och lagras inom EU."
          >
            <SecurityDemo />
          </BentoCard>
          <BentoCard
            icon={CreditCard}
            kicker="Betalning"
            title="Säker kortbetalning"
            delay={0.08}
            text="Köp PT:ns pass, program, kostcoaching eller helhetspaket med kort via Stripe. PT:n sätter priset – och priset du ser är priset du betalar."
          >
            <PaymentDemo />
          </BentoCard>
          <BentoCard icon={Plug} kicker="Anslutningar" title="Koppla dina appar" delay={0.16} text="Anslut Apple Health, Garmin och Strava till ditt Coavira-konto.">
            <ConnectionsDemo />
          </BentoCard>
        </div>

        <Reveal className="relative mt-8 flex flex-col items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5 text-center backdrop-blur-md sm:mt-10 sm:flex-row sm:p-6 sm:text-left">
          <p className="text-pretty text-muted-foreground">
            <span className="font-semibold text-foreground">Redo att köra?</span> Skapa ditt klientkonto för 0 kr med Apple, Google eller e-post.
          </p>
          <Link href={LINKS.start} className={cn(PRIMARY_BTN, "group h-12 shrink-0 px-6", FOCUS)}>
            Skapa konto – 0 kr
            <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Reveal>
      </div>
    </Section>
  )
}
