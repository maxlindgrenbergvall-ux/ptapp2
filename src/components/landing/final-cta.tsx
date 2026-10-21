"use client"

/**
 * Avslutningen på landningssidan: en stor uppmaning (#kom-igang-cta) med en
 * pulserande knapp som skjuter konfetti, snabbstart med Apple/Google/e-post och
 * flytande app-brickor – och sidfoten med länkar, juridik och kontakt.
 * Bakgrunden (norrsken, rutnät, horisont) och brickorna rör sig bara när
 * sektionen syns och "minska rörelse" är av. "0 kr" gäller bara klientkontot.
 */
import { animate, AnimatePresence, motion, useInView, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue, type Variants } from "framer-motion"
import { ArrowRight, ArrowUp, ArrowUpRight, BadgeCheck, CalendarCheck, Check, ChevronDown, CreditCard, Dumbbell, FileText, LogIn, Mail, ShieldCheck, Smartphone, Timer, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"

import { BrandMark } from "@/components/brand"
import { LINKS, NAV } from "@/components/landing/links"
import { EASE, Eyebrow, fadeUp, GradientText, stagger, useConfetti } from "@/components/landing/primitives"
import { BRAND } from "@/lib/brand"
import { cn } from "@/lib/utils"

const SECTION_ID = "kom-igang-cta"
const TITLE_ID = `${SECTION_ID}-title`
const NOTE_ID = `${SECTION_ID}-note`
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
/** Så länge (ms) konfettin hinner synas innan vi navigerar vid ett vanligt klick. */
const CONFETTI_DELAY = 420
const SPOT_SPRING = { stiffness: 140, damping: 22, mass: 0.6 }
const MAGNET_SPRING = { stiffness: 260, damping: 18, mass: 0.4 }

/* Nyckelbilder för loopar (stabila referenser, se useLoop). */
const SPIN = [0, 360]
const SPIN_BACK = [360, 0]
const BREATHE = [0.45, 0.95, 0.45]
const GRID_DRIFT = [0, 56]
const REST = [90, 0]

const WORD: Variants = {
  hidden: { opacity: 0, y: "105%" },
  show: { opacity: 1, y: "0%", transition: { duration: 0.9, ease: EASE } },
}

const SWOOSH: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  show: { pathLength: 1, opacity: 1, transition: { duration: 1.1, ease: EASE, delay: 0.55 } },
}

const LETTER: Variants = {
  hidden: { opacity: 0, y: "60%" },
  show: { opacity: 1, y: "0%", transition: { duration: 1, ease: EASE } },
}

/**
 * Oändlig loop på ett rörelsevärde (rotation, sken, drift). Körs bara när
 * `active` – alltså när sektionen syns och "minska rörelse" är av.
 */
function useLoop(keyframes: number[], duration: number, active: boolean, ease: "linear" | "easeInOut" = "easeInOut") {
  const value = useMotionValue(keyframes[0])
  React.useEffect(() => {
    if (!active) return
    const controls = animate(value, keyframes, { duration, ease, repeat: Infinity })
    return () => controls.stop()
  }, [value, keyframes, duration, active, ease])
  return value
}

/** Matchar mediefrågan? Falskt på servern och vid första renderingen (ingen hydreringsglapp). */
function useMediaQuery(query: string) {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query)
      media.addEventListener("change", onChange)
      return () => media.removeEventListener("change", onChange)
    },
    [query]
  )
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  )
}

/**
 * Mjuk scroll till ett ankare på sidan (direkt hopp med "minska rörelse").
 * Fokus flyttas till sektionens rubrik så att tangentbord och skärmläsare följer med.
 */
function jumpTo(e: React.MouseEvent<HTMLAnchorElement>, href: string, reduce: boolean, focusId?: string) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  const target = document.getElementById(href.slice(1))
  if (!target) return
  e.preventDefault()
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
  window.history.replaceState(window.history.state, "", href)
  const focusTarget = document.getElementById(focusId ?? `${target.id}-title`) ?? target
  if (!focusTarget.hasAttribute("tabindex")) focusTarget.setAttribute("tabindex", "-1")
  focusTarget.focus({ preventScroll: true })
}

/* ------------------------------------------------------------------ */
/* Logotyper (samma som inloggningsknapparna i appen)                  */
/* ------------------------------------------------------------------ */

function AppleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-5 fill-current", className)}>
      <path d="M16.37 1.43c0 1.14-.49 2.27-1.18 3.08-.74.9-1.99 1.57-2.99 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.57-2.27 1.21-2.98.8-.94 2.14-1.64 3.25-1.68.03.13.05.28.05.43zm4.56 15.71c-.03.07-.46 1.58-1.52 3.12-.94 1.34-1.94 2.71-3.43 2.71-1.52 0-1.9-.88-3.63-.88-1.7 0-2.3.91-3.67.91-1.38 0-2.33-1.26-3.43-2.8-1.29-1.82-2.32-4.63-2.32-7.28 0-4.28 2.8-6.55 5.55-6.55 1.45 0 2.67.95 3.6.95.86 0 2.22-1.01 3.9-1.01.61 0 2.89.06 4.37 2.19-.13.09-2.38 1.37-2.38 4.19 0 3.26 2.85 4.42 2.96 4.45z" />
    </svg>
  )
}

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={cn("size-5", className)}>
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Bakgrund: norrsken, rutnät, stjärnor och en glödande horisont       */
/* ------------------------------------------------------------------ */

/** Små gnistor på fasta platser (deterministiskt – ingen slump i render). */
const STARS = [
  { top: "12%", left: "8%", size: 3, delay: "0s" },
  { top: "22%", left: "88%", size: 2, delay: "0.8s" },
  { top: "34%", left: "18%", size: 2, delay: "1.6s" },
  { top: "9%", left: "62%", size: 2, delay: "0.4s" },
  { top: "46%", left: "93%", size: 3, delay: "2.1s" },
  { top: "58%", left: "5%", size: 2, delay: "1.2s" },
  { top: "28%", left: "40%", size: 2, delay: "2.6s" },
  { top: "16%", left: "30%", size: 2, delay: "1.9s" },
  { top: "40%", left: "74%", size: 2, delay: "0.2s" },
  { top: "64%", left: "84%", size: 2, delay: "2.9s" },
] as const

function CtaBackdrop({ active, progress, reduce }: { active: boolean; progress: MotionValue<number>; reduce: boolean }) {
  const spin = useLoop(SPIN, 70, active, "linear")
  const spinBack = useLoop(SPIN_BACK, 48, active, "linear")
  const drift = useLoop(GRID_DRIFT, 9, active, "linear")
  // Horisonten stiger in när sektionen scrollas fram.
  const rise = useTransform(progress, [0, 0.55], ["22%", "0%"])
  const auroraY = useTransform(progress, [0, 1], [80, -80])

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Mjuk övergång från sektionen ovanför. */}
      <div className="absolute inset-x-0 top-0 z-10 h-40 bg-gradient-to-b from-background to-transparent" />

      {/* Rutnät som glider nedåt (bara transform); masken ligger still på ramen runt det. */}
      <div className="absolute inset-0 [mask-image:radial-gradient(ellipse_75%_60%_at_50%_42%,black_10%,transparent_72%)]">
        <motion.div
          style={{ y: drift }}
          className="absolute inset-x-0 -top-14 bottom-0 [background-image:linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:56px_56px] will-change-transform"
        />
      </div>

      {/* Norrsken: mjuka radiella fält som roterar åt varsitt håll (ingen blur-filter). */}
      <motion.div style={reduce ? undefined : { y: auroraY }} className="absolute top-[40%] left-1/2 size-[58rem] -translate-x-1/2 -translate-y-1/2 sm:size-[72rem]">
        <motion.div
          style={{ rotate: spin }}
          className="absolute inset-0 rounded-full bg-[radial-gradient(ellipse_38%_30%_at_32%_34%,rgba(172,237,55,0.22),transparent_70%),radial-gradient(ellipse_34%_28%_at_70%_62%,rgba(16,185,129,0.2),transparent_70%)] will-change-transform"
        />
        <motion.div
          style={{ rotate: spinBack }}
          className="absolute inset-[12%] rounded-full bg-[radial-gradient(ellipse_40%_26%_at_62%_28%,rgba(110,231,183,0.16),transparent_70%),radial-gradient(ellipse_30%_34%_at_30%_72%,rgba(172,237,55,0.12),transparent_70%)] will-change-transform"
        />
      </motion.div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_55%_42%_at_50%_42%,rgba(172,237,55,0.1),transparent_70%)]" />

      {STARS.map((s) => (
        <span
          key={`${s.top}-${s.left}`}
          style={{ top: s.top, left: s.left, width: s.size, height: s.size, animationDelay: s.delay }}
          className="absolute animate-pulse rounded-full bg-brand/80 shadow-[0_0_8px_2px] shadow-brand/40 motion-reduce:animate-none"
        />
      ))}

      {/* Horisont: en jättecirkel i bakgrundsfärg med glödande överkant. */}
      <motion.div
        style={reduce ? undefined : { y: rise }}
        className="absolute top-[74%] left-1/2 aspect-square w-[max(150%,60rem)] -translate-x-1/2 rounded-full border-t border-brand/45 bg-[radial-gradient(ellipse_45%_12%_at_50%_0%,rgba(172,237,55,0.2),transparent),linear-gradient(#0a0d12,#0a0d12)] shadow-[0_-30px_140px_-30px_rgba(172,237,55,0.5)] will-change-transform sm:top-[70%]"
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Flytande app-brickor (exempeldata, bara på breda skärmar)           */
/* ------------------------------------------------------------------ */

/** En bricka med parallax (djup), intoning i bild och en lugn svävning. */
function FloatTile({
  children,
  className,
  depth,
  delay,
  active,
  progress,
  reduce,
}: {
  children: React.ReactNode
  className?: string
  depth: number
  delay: number
  active: boolean
  progress: MotionValue<number>
  reduce: boolean
}) {
  const y = useTransform(progress, [0, 1], [depth, -depth])
  return (
    <motion.div style={reduce ? undefined : { y }} className={cn("absolute", className)}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 28 }}
        whileInView={{ opacity: 1, scale: 1, y: 0 }}
        viewport={{ once: true, margin: "-10% 0px" }}
        transition={{ duration: 0.9, ease: EASE, delay }}
      >
        <motion.div
          animate={active ? { y: [0, -10, 0] } : { y: 0 }}
          transition={active ? { duration: 6 + delay * 4, repeat: Infinity, ease: "easeInOut" } : { duration: 0.4, ease: EASE }}
          whileHover={{ scale: 1.04, y: -4 }}
          className="pointer-events-auto overflow-hidden rounded-2xl border border-white/10 bg-[#0f141b]/85 text-foreground shadow-2xl shadow-black/50 backdrop-blur-md"
        >
          {children}
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

function BookingTile() {
  return (
    <div className="flex items-center gap-3 p-3 pr-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-brand-foreground shadow-[0_8px_24px_-8px] shadow-brand/70">
        <CalendarCheck className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">Pass bokat ⚡</p>
        <p className="text-xs text-muted-foreground tabular-nums">Tor 17:00 · Elin Söderberg</p>
      </div>
    </div>
  )
}

const MACRO_ROWS = [
  { label: "Protein", value: 98, target: 150, bar: "bg-macro-protein" },
  { label: "Kolhydrater", value: 160, target: 280, bar: "bg-macro-carbs" },
  { label: "Fett", value: 44, target: 75, bar: "bg-macro-fat" },
] as const

const KCAL = { eaten: 1460, target: 2400 }

/** "Dagens kost" i miniformat: kcal räknas upp och makrostaplarna fylls när brickan syns. */
function KcalTile({ reduce }: { reduce: boolean }) {
  const kcal = useMotionValue(0)
  const label = useTransform(kcal, (v) => Math.round(v).toLocaleString("sv-SE"))
  const share = KCAL.eaten / KCAL.target
  return (
    <motion.div
      className="w-56 p-3.5"
      onViewportEnter={() => {
        if (reduce) kcal.set(KCAL.eaten)
        else animate(kcal, KCAL.eaten, { duration: 1.4, ease: EASE, delay: 0.3 })
      }}
      viewport={{ once: true }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">Dagens kost</p>
        <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-muted-foreground">Idag</span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="relative size-12 shrink-0">
          <svg viewBox="0 0 44 44" className="size-full -rotate-90">
            <circle cx="22" cy="22" r="18" fill="none" strokeWidth="5" className="stroke-white/10" />
            <motion.circle
              cx="22"
              cy="22"
              r="18"
              fill="none"
              strokeWidth="5"
              strokeLinecap="round"
              className="stroke-brand"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: share }}
              viewport={{ once: true }}
              transition={{ duration: 1.4, ease: EASE, delay: 0.3 }}
            />
          </svg>
          <span className="absolute inset-0 grid place-items-center text-[10px] font-semibold tabular-nums">{Math.round(share * 100)}%</span>
        </div>
        <div>
          <p className="text-lg leading-none font-bold tabular-nums">
            <motion.span>{label}</motion.span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">av {KCAL.target.toLocaleString("sv-SE")} kcal</p>
        </div>
      </div>
      <ul className="mt-3 space-y-1.5">
        {MACRO_ROWS.map((m, i) => (
          <li key={m.label} className="text-[10px]">
            <div className="flex justify-between text-muted-foreground">
              <span>{m.label}</span>
              <span className="text-foreground tabular-nums">
                {m.value}/{m.target} g
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className={cn("h-full origin-left rounded-full", m.bar)}
                style={{ width: `${(m.value / m.target) * 100}%` }}
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1, ease: EASE, delay: 0.45 + i * 0.1 }}
              />
            </div>
          </li>
        ))}
      </ul>
    </motion.div>
  )
}

const SETS = [
  { n: 1, reps: 8, kg: "80", done: true },
  { n: 2, reps: 8, kg: "80", done: true },
  { n: 3, reps: 8, kg: "82,5", done: false },
] as const

/** Passloggaren i miniformat: set, kg, reps och en vilotimer som tickar ner. */
function WorkoutTile({ active }: { active: boolean }) {
  const rest = useLoop(REST, 90, active, "linear")
  const restLabel = useTransform(rest, (v) => {
    const s = Math.max(0, Math.ceil(v))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
  })
  return (
    <div className="w-56 p-3.5">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-semibold text-brand">
          <Dumbbell className="size-3" />
          Huvudpass
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">2/3 set</span>
      </div>
      <p className="mt-2 text-sm font-semibold">Knäböj</p>
      <ul className="mt-2 space-y-1.5 text-xs tabular-nums">
        {SETS.map((s) => (
          <li
            key={s.n}
            className={cn("flex items-center justify-between gap-2 rounded-lg px-2 py-1.5", s.done ? "bg-white/[0.04]" : "border border-brand/40 bg-brand/10")}
          >
            <span className="text-muted-foreground">Set {s.n}</span>
            <span className="font-medium">
              {s.reps} × {s.kg} kg
            </span>
            {s.done ? (
              <span className="grid size-4 place-items-center rounded-full bg-brand text-brand-foreground">
                <Check className="size-3" strokeWidth={3} />
              </span>
            ) : (
              <span className="size-4 rounded-full border border-brand/60" />
            )}
          </li>
        ))}
      </ul>
      <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Timer className="size-3.5 text-brand" />
        Vila
        <motion.span className="font-semibold text-foreground tabular-nums">{restLabel}</motion.span>
      </div>
    </div>
  )
}

function ChatTile() {
  return (
    <div className="w-56 p-3.5">
      <div className="flex items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-300 to-brand text-[11px] font-bold text-brand-foreground">ES</span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">Elin Söderberg</p>
          <p className="text-[10px] text-muted-foreground">Din PT · Chatt</p>
        </div>
      </div>
      <p className="mt-2.5 rounded-2xl rounded-tl-md bg-white/[0.06] px-3 py-2 text-xs leading-relaxed">Snyggt jobbat idag! 🔥 Nästa pass ligger i kalendern.</p>
      <div className="mt-2 flex justify-end">
        <p className="rounded-2xl rounded-br-md bg-brand px-3 py-2 text-xs font-medium text-brand-foreground">Tack! Ses på torsdag 💪</p>
      </div>
    </div>
  )
}

/**
 * Brickorna runt rubriken. Monteras bara från xl (1280 px) så att inget hamnar
 * utanför skärmen och inga dolda loopar körs på mobilen.
 */
function FloatingTiles({ active, progress, reduce }: { active: boolean; progress: MotionValue<number>; reduce: boolean }) {
  const shared = { active, progress, reduce }
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden xl:block">
      <FloatTile {...shared} className="top-[3%] left-0 -rotate-6" depth={70} delay={0.1}>
        <BookingTile />
      </FloatTile>
      <FloatTile {...shared} className="top-[40%] left-[2%] rotate-3" depth={40} delay={0.25}>
        <KcalTile reduce={reduce} />
      </FloatTile>
      <FloatTile {...shared} className="top-[6%] right-0 rotate-6" depth={55} delay={0.18}>
        <WorkoutTile active={active} />
      </FloatTile>
      <FloatTile {...shared} className="top-[52%] right-[2%] -rotate-3" depth={90} delay={0.32}>
        <ChatTile />
      </FloatTile>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Rubrik och den pulserande knappen                                   */
/* ------------------------------------------------------------------ */

/** Ett ord som glider upp ur en osynlig mask. */
function Word({ children }: { children: React.ReactNode }) {
  return (
    <span className="-my-[0.12em] inline-block overflow-hidden py-[0.12em] align-top">
      <motion.span variants={WORD} className="inline-block">
        {children}
      </motion.span>
    </span>
  )
}

function Headline() {
  return (
    <motion.h2
      id={TITLE_ID}
      variants={stagger(0.09)}
      className="text-[2.75rem] leading-[0.98] font-extrabold tracking-[-0.04em] text-balance sm:text-7xl md:text-8xl xl:text-[7.25rem]"
    >
      <span className="block">
        <Word>Din</Word> <Word>resa</Word>
      </span>{" "}
      <span className="relative inline-block">
        <Word>
          <GradientText>börjar idag.</GradientText>
        </Word>
        <svg aria-hidden viewBox="0 0 300 20" preserveAspectRatio="none" className="pointer-events-none absolute -bottom-[0.04em] left-[4%] h-[0.16em] w-[92%] text-brand/80">
          <motion.path variants={SWOOSH} d="M3 14 C 80 4, 180 2, 297 10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </span>
    </motion.h2>
  )
}

/**
 * Den stora knappen: pulserande ringar och sken, dras lätt mot muspekaren och
 * skjuter konfetti. Ett vanligt klick väntar ~0,4 s så att konfettin syns; klick
 * med Cmd/Ctrl/Skift (ny flik) och "minska rörelse" navigerar direkt.
 */
function JourneyButton({ active, reduce }: { active: boolean; reduce: boolean }) {
  const router = useRouter()
  const fire = useConfetti()
  const linkRef = React.useRef<HTMLAnchorElement>(null)
  const timer = React.useRef<number | null>(null)
  const glow = useLoop(BREATHE, 2.6, active)
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const x = useSpring(mx, MAGNET_SPRING)
  const y = useSpring(my, MAGNET_SPRING)

  React.useEffect(() => {
    const pending = timer
    return () => {
      if (pending.current !== null) window.clearTimeout(pending.current)
    }
  }, [])

  return (
    <motion.div
      style={{ x, y }}
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== "mouse") return
        const r = e.currentTarget.getBoundingClientRect()
        mx.set((e.clientX - (r.left + r.width / 2)) * 0.16)
        my.set((e.clientY - (r.top + r.height / 2)) * 0.3)
      }}
      onPointerLeave={() => {
        mx.set(0)
        my.set(0)
      }}
      className="group relative w-full max-w-sm sm:w-auto sm:max-w-none"
    >
      <motion.span aria-hidden style={{ opacity: glow }} className="pointer-events-none absolute -inset-3 rounded-full bg-brand/45 blur-2xl will-change-[opacity]" />
      {active &&
        [0, 1].map((i) => (
          <motion.span
            key={i}
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full border-2 border-brand/70"
            initial={{ scaleX: 1, scaleY: 1, opacity: 0.7 }}
            animate={{ scaleX: 1.1, scaleY: 1.55, opacity: 0 }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut", delay: i * 1.2 }}
          />
        ))}
      <Link
        ref={linkRef}
        href={LINKS.start}
        aria-describedby={NOTE_ID}
        onClick={() => {
          if (timer.current === null) void fire(linkRef.current, { particles: 160, spread: 100 })
        }}
        onNavigate={(e) => {
          if (reduce) return
          e.preventDefault()
          if (timer.current !== null) return
          timer.current = window.setTimeout(() => {
            timer.current = null
            router.push(LINKS.start)
          }, CONFETTI_DELAY)
        }}
        className={cn(
          "relative inline-flex min-h-16 w-full items-center justify-center gap-3 overflow-hidden rounded-full bg-brand px-6 py-3 text-center text-base font-bold text-brand-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.35)_inset,0_20px_60px_-15px_rgba(172,237,55,0.7)] transition-transform duration-300 ease-out group-hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] sm:min-h-[4.5rem] sm:w-auto sm:px-10 sm:text-lg md:text-xl",
          FOCUS
        )}
      >
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1/3 -translate-x-full -skew-x-12 bg-gradient-to-r from-transparent via-white/55 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[420%]"
        />
        <span className="relative">Börja din resa med Coavira</span>
        <span aria-hidden className="relative grid size-8 shrink-0 place-items-center rounded-full bg-brand-foreground/10 sm:size-9">
          <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-0.5" />
        </span>
      </Link>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* Snabbstart och trygghetsrad                                         */
/* ------------------------------------------------------------------ */

const QUICK_BTN = "inline-flex min-h-12 items-center justify-center gap-2.5 rounded-full px-4 text-sm font-semibold transition-[background-color,border-color,translate] duration-300 hover:-translate-y-0.5"

function QuickStart() {
  return (
    <div className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset] backdrop-blur-md sm:p-5">
      <div aria-hidden className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-brand/50 to-transparent" />
      <div className="mb-4 flex items-center gap-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-transparent to-white/15" />
        Eller fortsätt direkt
        <span aria-hidden className="h-px flex-1 bg-gradient-to-l from-transparent to-white/15" />
      </div>
      <div role="group" aria-label="Snabbstart" className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <Link href={LINKS.start} className={cn(QUICK_BTN, "bg-white text-black hover:bg-white/90", FOCUS)}>
          <AppleLogo />
          Fortsätt med Apple
        </Link>
        <Link href={LINKS.start} className={cn(QUICK_BTN, "border border-white/15 bg-white/[0.06] text-foreground hover:border-white/25 hover:bg-white/[0.1]", FOCUS)}>
          <GoogleLogo />
          Fortsätt med Google
        </Link>
        <Link
          href={LINKS.signup}
          className={cn(QUICK_BTN, "border border-white/15 bg-white/[0.06] text-foreground hover:border-brand/40 hover:bg-white/[0.1] sm:col-span-2 lg:col-span-1", FOCUS)}
        >
          <Mail aria-hidden className="size-5 text-brand" />
          Registrera med e-post
        </Link>
      </div>
      <div className="mt-3 flex flex-col items-center justify-center gap-x-6 sm:flex-row">
        <Link href={LINKS.login} className={cn("group inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:text-foreground", FOCUS)}>
          <LogIn aria-hidden className="size-4 text-brand" />
          Har du konto?
          <span className="font-semibold text-foreground underline decoration-white/25 underline-offset-4 transition-colors group-hover:decoration-brand">Logga in</span>
        </Link>
        <Link href={LINKS.ptLogin} className={cn("group inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:text-foreground", FOCUS)}>
          <BadgeCheck aria-hidden className="size-4 text-brand" />
          Är du PT?
          <span className="font-semibold text-foreground underline decoration-white/25 underline-offset-4 transition-colors group-hover:decoration-brand">PT-inloggning</span>
        </Link>
      </div>
    </div>
  )
}

const TRUST = [
  { icon: CreditCard, text: "Säker kortbetalning via Stripe" },
  { icon: BadgeCheck, text: "Manuellt verifierade PT:er" },
  { icon: ShieldCheck, text: "Hälsodata bara med ditt samtycke" },
] as const

/* ------------------------------------------------------------------ */
/* FinalCta                                                            */
/* ------------------------------------------------------------------ */

/** Sidans sista uppmaning: rubrik, pulserande knapp, snabbstart och trygghetsrad. */
export function FinalCta() {
  const ref = React.useRef<HTMLElement>(null)
  // Hydreringssäker: falskt på servern och vid första renderingen, följer sedan inställningen live.
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)")
  const inView = useInView(ref, { margin: "-10% 0px" })
  const active = inView && !reduce
  const wide = useMediaQuery("(min-width: 80rem)")
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] })
  // Ett mjukt ljus som följer muspekaren (bara transform/opacitet).
  const px = useMotionValue(0)
  const py = useMotionValue(0)
  const spotX = useSpring(px, SPOT_SPRING)
  const spotY = useSpring(py, SPOT_SPRING)
  const spotOpacity = useMotionValue(0)

  // Ladda konfetti-biblioteket i förväg så att det hinner synas vid första klicket.
  React.useEffect(() => {
    if (inView && !reduce) void import("canvas-confetti")
  }, [inView, reduce])

  return (
    <section
      ref={ref}
      id={SECTION_ID}
      aria-labelledby={TITLE_ID}
      onPointerEnter={(e) => {
        if (reduce || e.pointerType !== "mouse") return
        // Ljuset tänds där pekaren kom in, i stället för att glida in från hörnet.
        const r = e.currentTarget.getBoundingClientRect()
        px.jump(e.clientX - r.left)
        py.jump(e.clientY - r.top)
        spotX.jump(e.clientX - r.left)
        spotY.jump(e.clientY - r.top)
        animate(spotOpacity, 1, { duration: 0.4 })
      }}
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== "mouse") return
        const r = e.currentTarget.getBoundingClientRect()
        px.set(e.clientX - r.left)
        py.set(e.clientY - r.top)
      }}
      onPointerLeave={() => {
        animate(spotOpacity, 0, { duration: 0.5 })
      }}
      className="relative isolate scroll-mt-24 overflow-hidden px-4 pt-28 pb-32 sm:px-6 sm:pt-36 sm:pb-40 lg:pt-44 lg:pb-48"
    >
      <CtaBackdrop active={active} progress={scrollYProgress} reduce={reduce} />
      <motion.div
        aria-hidden
        style={{ x: spotX, y: spotY, opacity: spotOpacity }}
        className="pointer-events-none absolute top-0 left-0 -z-10 size-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(172,237,55,0.1),transparent)] will-change-transform"
      />

      <div className="relative mx-auto max-w-7xl">
        {wide && <FloatingTiles active={active} progress={scrollYProgress} reduce={reduce} />}

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger(0.11)}
          className="relative z-10 mx-auto flex max-w-4xl flex-col items-center gap-8 text-center sm:gap-10"
        >
          <motion.div variants={fadeUp}>
            <Eyebrow>Ditt första steg</Eyebrow>
          </motion.div>

          <Headline />

          <motion.p variants={fadeUp} className="max-w-2xl text-lg text-pretty text-muted-foreground sm:text-xl">
            Skapa ditt klientkonto för <span className="font-semibold text-foreground">0 kr</span> med Apple, Google eller e-post. Köp din PT:s tjänster med kort,
            boka passen och se framstegen – träning, kost, kalender och chatt på ett och samma ställe.
          </motion.p>

          <motion.div variants={fadeUp} className="flex w-full flex-col items-center gap-4">
            <JourneyButton active={active} reduce={reduce} />
            <p id={NOTE_ID} className="max-w-md text-sm text-pretty text-muted-foreground">
              0 kr gäller klientkontot – du betalar bara för tjänsterna du köper, och priset du ser är priset du betalar.
            </p>
          </motion.div>

          <motion.div variants={fadeUp} className="flex w-full justify-center">
            <QuickStart />
          </motion.div>

          <motion.ul variants={fadeUp} className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
            {TRUST.map(({ icon: Icon, text }) => (
              <li key={text} className="inline-flex items-center gap-2">
                <Icon aria-hidden className="size-4 text-brand" />
                {text}
              </li>
            ))}
          </motion.ul>
        </motion.div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Sidfot                                                              */
/* ------------------------------------------------------------------ */

type FooterLink = { label: string; href: string; kind: "anchor" | "route" | "mail"; hint?: string; icon?: LucideIcon }

const PRODUCT_LINKS: readonly FooterLink[] = NAV.map((item) => ({ label: item.label, href: item.href, kind: "anchor" }))

const ACCOUNT_LINKS: readonly FooterLink[] = [
  { label: "Kom igång", href: LINKS.start, kind: "route" },
  { label: "Logga in", href: LINKS.login, kind: "route" },
  { label: "Registrera", href: LINKS.signup, kind: "route" },
  { label: "PT-inloggning", href: LINKS.ptLogin, kind: "route" },
  { label: "Ansök som PT", href: LINKS.ptApply, kind: "mail" },
]

const ABOUT_LINKS: readonly FooterLink[] = [
  { label: "Integritet", href: LINKS.privacy, kind: "route", hint: "Så hanterar vi dina data", icon: ShieldCheck },
  { label: "Villkor", href: LINKS.terms, kind: "route", hint: "Användarvillkor", icon: FileText },
  { label: "Kontakt", href: LINKS.contact, kind: "mail", hint: BRAND.contactEmail, icon: Mail },
]

const FOOTER_CHIPS = [
  { icon: BadgeCheck, text: "Verifierade PT:er" },
  { icon: CreditCard, text: "Betalning via Stripe" },
  { icon: Smartphone, text: "iOS- och Android-app på väg" },
] as const

const WORDMARK = BRAND.name.split("")

/** En länk i sidfoten: ankare (mjuk scroll), sida (next/link) eller e-post. */
function FooterLinkItem({ link, reduce }: { link: FooterLink; reduce: boolean }) {
  const cls = cn("group inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground", FOCUS)
  const inner = (
    <>
      <span className="relative">
        {link.label}
        <span aria-hidden className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-brand transition-transform duration-300 group-hover:scale-x-100" />
      </span>
      {link.kind === "mail" && (
        <>
          <ArrowUpRight aria-hidden className="size-3.5 opacity-60 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          <span className="sr-only"> (öppnar e-post)</span>
        </>
      )}
    </>
  )
  if (link.kind === "route") {
    return (
      <Link href={link.href} className={cls}>
        {inner}
      </Link>
    )
  }
  return (
    <a href={link.href} className={cls} onClick={link.kind === "anchor" ? (e) => jumpTo(e, link.href, reduce) : undefined}>
      {inner}
    </a>
  )
}

function FooterColumn({ title, links, reduce, className }: { title: string; links: readonly FooterLink[]; reduce: boolean; className?: string }) {
  return (
    <motion.div variants={fadeUp} className={className}>
      <h3 className="text-xs font-semibold tracking-wider text-foreground uppercase">{title}</h3>
      <ul className="mt-3">
        {links.map((link) => (
          <li key={link.label}>
            <FooterLinkItem link={link} reduce={reduce} />
          </li>
        ))}
      </ul>
    </motion.div>
  )
}

/** Mobil: "Juridik & kontakt" fälls ut på plats (knapp med aria-expanded). */
function LegalDisclosure({ className }: { className?: string }) {
  const [open, setOpen] = React.useState(false)
  const panelId = React.useId()
  return (
    <motion.div variants={fadeUp} className={cn("rounded-2xl border border-white/10 bg-white/[0.03]", className)}>
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className={cn("flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl px-4 text-left text-sm font-semibold transition-colors hover:bg-white/[0.04]", FOCUS)}
        >
          <span className="flex items-center gap-2.5">
            <ShieldCheck aria-hidden className="size-4 text-brand" />
            Juridik &amp; kontakt
          </span>
          <motion.span aria-hidden animate={{ rotate: open ? 180 : 0 }} transition={{ type: "spring", stiffness: 380, damping: 28 }} className="grid place-items-center">
            <ChevronDown className="size-4 text-muted-foreground" />
          </motion.span>
        </button>
      </h3>
      <div id={panelId}>
        <AnimatePresence initial={false}>
          {open && (
            <motion.ul
              key="lankar"
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              variants={stagger(0.05)}
              className="space-y-1 px-2 pb-2"
            >
              {ABOUT_LINKS.map((link) => {
                const Icon = link.icon ?? ArrowUpRight
                const body = (
                  <>
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.05]">
                      <Icon aria-hidden className="size-4 text-brand" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">{link.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{link.hint}</span>
                    </span>
                    {link.kind === "mail" ? <span className="sr-only"> (öppnar e-post)</span> : null}
                    <ArrowUpRight aria-hidden className="size-4 text-muted-foreground" />
                  </>
                )
                const cls = cn("flex min-h-12 items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/[0.05]", FOCUS)
                return (
                  <motion.li key={link.label} variants={fadeUp}>
                    {link.kind === "route" ? (
                      <Link href={link.href} className={cls}>
                        {body}
                      </Link>
                    ) : (
                      <a href={link.href} className={cls}>
                        {body}
                      </a>
                    )}
                  </motion.li>
                )
              })}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

/** Sidfoten: logga, länkkolumner, juridik/kontakt, stort ordmärke och copyright. */
export function LandingFooter() {
  const reduce = !!useReducedMotion()
  return (
    <footer className="relative isolate overflow-hidden px-4 pt-20 pb-[calc(2rem+var(--safe-bottom))] sm:px-6 sm:pt-24">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/50 to-transparent" />
        <div className="absolute -top-40 left-1/2 h-72 w-[min(56rem,100%)] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(172,237,55,0.1),transparent)]" />
      </div>
      <h2 className="sr-only">Sidfot</h2>

      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] lg:gap-16">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-40px" }}
            variants={stagger(0.08)}
            className="max-w-sm space-y-5"
          >
            <motion.div variants={fadeUp}>
              <a
                href="#innehall"
                onClick={(e) => jumpTo(e, "#innehall", reduce, "hero-title")}
                className={cn("group inline-flex min-h-11 items-center gap-2.5 rounded-lg text-lg font-semibold tracking-tight", FOCUS)}
              >
                <BrandMark size="md" className="transition-transform duration-300 group-hover:-rotate-6" />
                {BRAND.name}
                <span className="sr-only"> – till toppen</span>
              </a>
            </motion.div>
            <motion.p variants={fadeUp} className="text-sm text-pretty text-muted-foreground">
              Träning, kost och coachning med din PT – samlat i en plattform.
            </motion.p>
            <motion.ul variants={fadeUp} className="flex flex-wrap gap-2">
              {FOOTER_CHIPS.map(({ icon: Icon, text }) => (
                <li key={text} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-muted-foreground">
                  <Icon aria-hidden className="size-3.5 text-brand" />
                  {text}
                </li>
              ))}
            </motion.ul>
          </motion.div>

          <motion.nav
            aria-label="Sidfot"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-40px" }}
            variants={stagger(0.08, 0.1)}
            className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3"
          >
            <FooterColumn title="Produkt" links={PRODUCT_LINKS} reduce={reduce} />
            <FooterColumn title="Konto" links={ACCOUNT_LINKS} reduce={reduce} />
            <FooterColumn title="Om Coavira" links={ABOUT_LINKS} reduce={reduce} className="hidden md:block" />
            <LegalDisclosure className="col-span-2 md:hidden" />
          </motion.nav>
        </div>

        <motion.div
          aria-hidden
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          variants={stagger(0.05)}
          className="pointer-events-none mt-16 flex justify-center overflow-hidden text-[22vw] leading-[0.85] font-extrabold tracking-[-0.06em] select-none sm:mt-20 xl:text-[15rem]"
        >
          {WORDMARK.map((ch, i) => (
            <motion.span key={`${ch}-${i}`} variants={LETTER} className="inline-block bg-gradient-to-b from-white/[0.14] via-white/[0.05] to-transparent bg-clip-text pb-[0.06em] text-transparent">
              {ch}
            </motion.span>
          ))}
        </motion.div>

        <div className="flex flex-col gap-3 border-t border-white/10 pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 {BRAND.name}</p>
          <p>
            Byggt i Sverige <span aria-hidden>🇸🇪</span> · Data lagras inom EU
          </p>
          <a
            href="#innehall"
            onClick={(e) => jumpTo(e, "#innehall", reduce, "hero-title")}
            className={cn("group inline-flex min-h-11 items-center gap-2 self-start rounded-full text-sm font-medium text-foreground/85 transition-colors hover:text-foreground sm:self-auto", FOCUS)}
          >
            Till toppen
            <span className="grid size-8 place-items-center rounded-full border border-white/10 bg-white/[0.04] transition-[border-color,translate] duration-300 group-hover:-translate-y-0.5 group-hover:border-brand/40">
              <ArrowUp aria-hidden className="size-4 text-brand" />
            </span>
          </a>
        </div>
      </div>
    </footer>
  )
}
