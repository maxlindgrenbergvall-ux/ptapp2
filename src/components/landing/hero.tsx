"use client"

/**
 * Hjälten överst på landningssidan: sidans enda h1, knappar och en interaktiv
 * telefon i 3D med Coavira-appens startsida (exempeldata). Telefonen följer
 * pekaren, svävar och har parallax vid scroll. Längst ner ett rullande band med
 * fakta som pausas vid hovring och står still med "minska rörelse".
 */
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion"
import {
  ArrowDown,
  ArrowRight,
  BadgeCheck,
  Bell,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  CalendarSync,
  ChartLine,
  Check,
  CreditCard,
  Download,
  Dumbbell,
  GripVertical,
  House,
  Lock,
  MessageCircle,
  MousePointer2,
  Pause,
  PhoneMissed,
  Play,
  Salad,
  Search,
  ShieldCheck,
  Smartphone,
  Users,
  Utensils,
  Video,
  Watch,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { BrandMark } from "@/components/brand"
import { LINKS } from "@/components/landing/links"
import { EASE, Eyebrow, FloatingBadge, GlowOrb, GradientText, GridBackdrop, PhoneFrame, useConfetti } from "@/components/landing/primitives"
import { MACROS, type MacroKey } from "@/components/nutrition/macros"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ */
/* Exempeldata (illustration – inga riktiga användare eller siffror)   */
/* ------------------------------------------------------------------ */

type Nutrients = Record<"kcal" | MacroKey, number>

/** Mål och intag för "Dagens kost" i mockupen. Lunchen kan bockas av. */
const TARGET: Nutrients = { kcal: 2400, protein: 150, carbs: 280, fat: 75 }
const BEFORE_LUNCH: Nutrients = { kcal: 840, protein: 52, carbs: 96, fat: 26 }
const LUNCH: Nutrients = { kcal: 620, protein: 48, carbs: 70, fat: 16 }

/** Veckoremsan (mån 13 – sön 19), idag = tisdag 14. Torsdag 16 fylls i när man bokar. */
const WEEK = [
  { day: "M", date: 13, done: true },
  { day: "T", date: 14, planned: true },
  { day: "O", date: 15 },
  { day: "T", date: 16 },
  { day: "F", date: 17 },
  { day: "L", date: 18, planned: true },
  { day: "S", date: 19 },
] as const
const TODAY = 14
const SLOT_DAY = 16
const PASSES_LEFT = 4

const TABS: { label: string; icon: LucideIcon; active?: boolean; dot?: boolean }[] = [
  { label: "Idag", icon: House, active: true },
  { label: "Kalender", icon: CalendarDays },
  { label: "Hitta PT", icon: Search },
  { label: "Framsteg", icon: ChartLine },
  { label: "Chatt", icon: MessageCircle, dot: true },
]

/** Sanna fakta om plattformen för det rullande bandet. */
const TRUST: { label: string; icon: LucideIcon }[] = [
  { label: "Manuellt verifierade PT:er", icon: BadgeCheck },
  { label: "Säker kortbetalning via Stripe", icon: CreditCard },
  { label: "Data lagras inom EU", icon: ShieldCheck },
  { label: "Kalendersynk med Google, Outlook & Apple", icon: CalendarSync },
  { label: "Kopplas till Apple Health, Garmin & Strava", icon: Watch },
  { label: "Hälsodata bara med ditt samtycke", icon: Lock },
  { label: "Flera PT:er samtidigt", icon: Users },
  { label: "Chatt och samtal med din PT", icon: Video },
  { label: "Exportera eller radera din data när du vill", icon: Download },
  { label: "iOS- och Android-app på väg", icon: Smartphone },
]

/* ------------------------------------------------------------------ */
/* Små hjälpare                                                        */
/* ------------------------------------------------------------------ */

/** 1420 → "1 420" (hårt mellanslag, som i appen). */
const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")

const FLOAT = { transform: ["translateY(0px)", "translateY(-14px)", "translateY(0px)"] }
const SPIN = { transform: ["rotate(0deg)", "rotate(360deg)"] }
const GLOW = { opacity: [0.45, 0.85, 0.45] }
const PULSE_KEYS = [1, 1.12, 1]

/**
 * Oändlig loop (svävning, rotation, sken) som props till ett motion-element.
 * Transform och opacitet går via Web Animations i kompositorn i stället för JS
 * varje bildruta. Loopen körs bara när `active` – alltså när hjälten syns och
 * "minska rörelse" är av – annars vilar elementet i första läget.
 */
function loop(active: boolean, keyframes: typeof FLOAT | typeof GLOW, duration: number, ease: "linear" | "easeInOut" = "easeInOut") {
  if (active) return { animate: keyframes, transition: { duration, ease, repeat: Infinity } }
  const rest = "transform" in keyframes ? { transform: keyframes.transform[0] } : { opacity: keyframes.opacity[0] }
  return { animate: rest, transition: { duration: 0 } }
}

/** Räknar upp mot `target` när `start` blir sant (direkt med "minska rörelse"). */
function useCountUp(target: number, start: boolean, reduce: boolean) {
  const value = useMotionValue(0)
  React.useEffect(() => {
    if (!start) return
    if (reduce) {
      value.set(target)
      return
    }
    const controls = animate(value, target, { duration: 1.4, ease: EASE })
    return () => controls.stop()
  }, [value, target, start, reduce])
  return value
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

/** Första intrycket: rubrik, knappar, interaktiv app-telefon och faktaband. */
export function Hero() {
  const ref = React.useRef<HTMLElement>(null)
  const reduce = !!useReducedMotion()
  const inView = useInView(ref)
  const active = inView && !reduce
  // Pekarens läge (-0.5 … 0.5) med fjädring – styr telefonens lutning och djupet.
  const px = useMotionValue(0)
  const py = useMotionValue(0)
  const sx = useSpring(px, { stiffness: 80, damping: 18, mass: 0.8 })
  const sy = useSpring(py, { stiffness: 80, damping: 18, mass: 0.8 })
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] })
  const backdropY = useTransform(scrollYProgress, (v) => (reduce ? 0 : v * -140))

  return (
    <section
      ref={ref}
      aria-labelledby="hero-title"
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== "mouse") return
        px.set(e.clientX / window.innerWidth - 0.5)
        py.set(e.clientY / window.innerHeight - 0.5)
      }}
      onPointerLeave={() => {
        px.set(0)
        py.set(0)
      }}
      className="relative isolate flex flex-col overflow-hidden lg:min-h-svh"
    >
      <Backdrop y={backdropY} />
      <div className="relative mx-auto grid w-full max-w-7xl flex-1 items-center gap-6 px-4 pt-[calc(4rem+var(--safe-top)+1.25rem)] pb-12 sm:px-6 sm:pt-[calc(4rem+var(--safe-top)+3.5rem)] lg:grid-cols-2 lg:gap-8 lg:px-8 lg:pt-[calc(4rem+var(--safe-top)+2rem)] lg:pb-8">
        <HeroCopy active={active} />
        <AppShowcase sx={sx} sy={sy} progress={scrollYProgress} reduce={reduce} active={active} />
      </div>
      <TrustMarquee reduce={reduce} />
    </section>
  )
}

/** Rutnät, gröna glöd och ett svagt ljus uppifrån. Rör sig långsamt vid scroll. */
function Backdrop({ y }: { y: MotionValue<number> }) {
  return (
    <>
      <motion.div aria-hidden style={{ y }} className="pointer-events-none absolute inset-0 -z-10 will-change-transform">
        <GridBackdrop className="[mask-image:radial-gradient(ellipse_70%_60%_at_50%_35%,black_15%,transparent_75%)]" />
        <GlowOrb className="-top-56 right-[-14%] size-[44rem] bg-brand/[0.15]" />
        <GlowOrb className="top-[28%] -left-64 size-[34rem] bg-emerald-500/[0.13]" />
        <GlowOrb className="-bottom-72 left-[38%] size-[30rem] bg-emerald-400/10" />
        <div className="absolute inset-x-0 top-0 h-[30rem] bg-[radial-gradient(ellipse_55%_100%_at_50%_0%,rgba(172,237,55,0.08),transparent)]" />
      </motion.div>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-48 bg-gradient-to-b from-transparent to-background" />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Text och knappar                                                    */
/* ------------------------------------------------------------------ */

/**
 * In-animation i ren CSS (tw-animate-css): startar vid första målningen, före
 * hydrering, så att h1 och knappar syns direkt i serverns HTML – även utan JS.
 */
const ENTER = "animate-in fade-in-0 fill-mode-both ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:animate-none"
const enterDelay = (s: number): React.CSSProperties => ({ animationDelay: `${s}s` })

const LINE_TWO = ["Allt", "i", "en", "och", "samma", "plattform."]

/** Ett ord som glider upp ur en osynlig mask (opacitet + y + lätt vridning). */
function Word({ children, index, className }: { children: React.ReactNode; index: number; className?: string }) {
  return (
    <span className="-my-[0.12em] inline-block overflow-hidden py-[0.12em] align-top">
      <span className={cn(ENTER, "inline-block origin-bottom-left duration-[850ms] slide-in-from-bottom-[105%] spin-in-4")} style={enterDelay(0.1 + index * 0.06)}>
        {className ? <span className={className}>{children}</span> : children}
      </span>
    </span>
  )
}

/** Sidans enda h1, ord för ord. */
function Headline() {
  return (
    <h1
      id="hero-title"
      className="text-[2.375rem] leading-[1.02] font-extrabold tracking-[-0.035em] text-balance min-[420px]:text-[2.75rem] sm:text-6xl md:text-[4rem] lg:text-[3.25rem] xl:text-[4.25rem]"
    >
      <span className="block">
        <Word index={0}>Framtidens</Word>{" "}
        <span className="relative inline-block whitespace-nowrap">
          <Word index={1}>
            <GradientText>träning &amp; kost</GradientText>.
          </Word>
          <svg aria-hidden viewBox="0 0 300 20" preserveAspectRatio="none" className="pointer-events-none absolute -bottom-[0.06em] left-0 h-[0.2em] w-[92%] text-brand/80">
            <motion.path
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.1, ease: EASE, delay: 0.75 }}
              d="M3 15 C 70 5, 160 2, 297 9"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </span>{" "}
      </span>
      <span className="block">
        {LINE_TWO.map((w, i) => (
          <React.Fragment key={w}>
            {i > 0 && " "}
            <Word index={i + 2} className="bg-gradient-to-b from-foreground via-foreground/80 to-foreground/50 bg-clip-text text-transparent">
              {w}
            </Word>
          </React.Fragment>
        ))}
      </span>
    </h1>
  )
}

/** Vänsterspalten: etikett, rubrik, ingress, knappar och trygghetsrad. */
function HeroCopy({ active }: { active: boolean }) {
  return (
    <div className="relative z-10 flex flex-col items-center gap-5 text-center sm:gap-7 lg:items-start lg:text-left">
      <div className={cn(ENTER, "duration-700 slide-in-from-bottom-6")}>
        <Eyebrow>Ny plattform för PT:er och klienter</Eyebrow>
      </div>

      <Headline />

      <p className={cn(ENTER, "max-w-xl text-lg text-pretty text-muted-foreground duration-700 slide-in-from-bottom-6 sm:text-xl")} style={enterDelay(0.3)}>
        Sömlös coachning för <span className="font-medium text-foreground">PT:er</span>. Maximal effekt för{" "}
        <span className="font-medium text-foreground">klienter</span>. Inget betalningskrångel.
      </p>

      <div
        className={cn(ENTER, "flex w-full max-w-sm flex-col gap-3 duration-700 slide-in-from-bottom-6 sm:w-auto sm:max-w-none sm:flex-row sm:flex-wrap sm:justify-center lg:justify-start")}
        style={enterDelay(0.4)}
      >
        <div className="group relative">
          <motion.span aria-hidden {...loop(active, GLOW, 3.4)} className="pointer-events-none absolute -inset-1.5 rounded-full bg-brand/50 blur-xl" />
          <Link
            href={LINKS.start}
            className="relative inline-flex h-14 w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-brand px-7 text-base font-semibold text-brand-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.35)_inset] transition-transform duration-300 ease-out group-hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none active:translate-y-0 active:scale-[0.98] sm:w-auto"
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-1/3 -translate-x-full -skew-x-12 bg-gradient-to-r from-transparent via-white/55 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[420%]"
            />
            <span className="relative">Skapa klientkonto – 0 kr</span>
            <ArrowRight aria-hidden className="relative size-5 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </div>
        {/* Mobil: en kompakt textlänk så att huvudknappen får all tyngd. Från sm: en kantad knapp bredvid. */}
        <a
          href={LINKS.ptApply}
          className="group/pt inline-flex h-11 items-center justify-center gap-2 self-center rounded-full px-2 text-sm font-semibold text-foreground transition-[background-color,border-color,translate] duration-300 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none sm:h-14 sm:self-auto sm:border sm:border-white/15 sm:bg-white/[0.04] sm:px-6 sm:text-base sm:backdrop-blur-md sm:hover:-translate-y-0.5 sm:hover:border-white/25 sm:hover:bg-white/[0.08]"
        >
          <BadgeCheck aria-hidden className="size-5 text-brand" />
          <span className="underline decoration-white/25 underline-offset-4 transition-colors group-hover/pt:decoration-brand sm:no-underline">Är du PT? Ansök</span>
          <span className="sr-only"> (via e-post)</span>
        </a>
      </div>

      <div className={cn(ENTER, "-mt-2 flex flex-col items-center gap-2 duration-700 slide-in-from-bottom-6 lg:items-start")} style={enterDelay(0.5)}>
        <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground sm:gap-x-3 lg:justify-start">
          <span className="inline-flex items-center gap-1.5">
            <Lock aria-hidden className="size-4 text-brand" />
            Apple, Google eller e-post
          </span>
          {/* Punkten bara där raden får plats på en rad – annars hänger den kvar i slutet av första raden. */}
          <span aria-hidden className="hidden text-white/25 sm:inline">
            ·
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CreditCard aria-hidden className="size-4 text-brand" />
            Säker kortbetalning via Stripe
          </span>
        </p>
        <p className="max-w-md text-sm text-pretty text-muted-foreground">
          0 kr gäller klientkontot – du betalar bara för tjänsterna du köper. PT-konton skapas av Coavira efter granskning av certifikat.
        </p>
        {/* På mobil är telefonen som sticker upp under texten själva scroll-signalen. */}
        <a
          href="#funktioner"
          className="group hidden h-11 items-center gap-2 rounded-full px-2 text-sm font-medium text-foreground/85 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:inline-flex"
        >
          <span className="underline decoration-white/25 underline-offset-4 transition-colors group-hover:decoration-brand">Se funktionerna</span>
          <ArrowDown aria-hidden className="size-4 transition-transform duration-300 group-hover:translate-y-0.5" />
        </a>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* App-scenen: telefon, halo, bakre kort och flytande brickor          */
/* ------------------------------------------------------------------ */

function AppShowcase({
  sx,
  sy,
  progress,
  reduce,
  active,
}: {
  sx: MotionValue<number>
  sy: MotionValue<number>
  progress: MotionValue<number>
  reduce: boolean
  active: boolean
}) {
  const [booked, setBooked] = React.useState(false)
  const [bookings, setBookings] = React.useState(0)

  // Grundlutning: tydlig på dator, mildare när telefonen står ensam (mobil/surfplatta).
  const tilt = useMotionValue(1)
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)")
    const apply = () => tilt.set(mq.matches ? 1 : 0.55)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [tilt])

  // Djup: telefonen lutar, bakre kortet och brickorna förskjuts åt olika håll.
  const rotateY = useTransform([sx, tilt], ([x, t]: number[]) => -13 * t + x * 16)
  const rotateX = useTransform([sy, tilt], ([y, t]: number[]) => 7 * t - y * 10)
  const glareX = useTransform(sx, (v) => `${v * 50}%`)
  const phoneY = useTransform(progress, (v) => (reduce ? 0 : v * 90))
  const backX = useTransform(sx, (v) => v * -28)
  const backY = useTransform(progress, (v) => (reduce ? 0 : v * 170))
  const badgesX = useTransform(sx, (v) => v * 22)
  const badgesY = useTransform([sy, progress], ([s, p]: number[]) => s * 16 + (reduce ? 0 : p * -60))

  // "Nytt pass inbokat!"-brickan studsar till när man bokar i telefonen.
  const pulse = useMotionValue(1)
  React.useEffect(() => {
    if (!bookings || reduce) return
    const controls = animate(pulse, PULSE_KEYS, { duration: 0.6, ease: "easeOut" })
    return () => controls.stop()
  }, [bookings, pulse, reduce])

  return (
    <div
      className={cn(ENTER, "relative mx-auto flex h-[640px] w-full max-w-[560px] items-center justify-center duration-[1100ms] zoom-in-[0.96] slide-in-from-bottom-10 sm:h-[700px]")}
      style={enterDelay(0.3)}
    >
      <Halo active={active} />

      {/* Bakre lager: PT:ns kalender sticker fram bakom telefonen (inte vid lg – där syns bara en remsa). */}
      <motion.div aria-hidden style={{ x: backX, y: backY }} className="absolute top-[40%] left-[1%] hidden sm:block lg:hidden xl:block">
        <PtCalendarCard />
      </motion.div>

      {/* Skugga under telefonen. */}
      <div aria-hidden className="pointer-events-none absolute bottom-[3%] left-1/2 h-10 w-56 -translate-x-1/2 rounded-full bg-black/70 blur-2xl" />

      <motion.div style={{ y: phoneY }} className="relative z-10">
        <motion.div style={{ rotateX, rotateY, transformPerspective: 1600 }}>
          <motion.div {...loop(active, FLOAT, 7)}>
            <ClientHomeScreen
              booked={booked}
              tried={bookings > 0}
              glareX={glareX}
              reduce={reduce}
              active={active}
              onBook={() => {
                setBooked(true)
                setBookings((n) => n + 1)
              }}
              onUndo={() => setBooked(false)}
            />
          </motion.div>
        </motion.div>
      </motion.div>

      {/*
        Flytande brickor (dekor – samma fakta finns i text på sidan). De ligger
        utanför telefonen så långt det går, så att de bara skär in i skärmens
        kantmarginal och aldrig döljer veckoremsan eller Dagens kost.
      */}
      <motion.div aria-hidden style={{ x: badgesX, y: badgesY }} className="pointer-events-none absolute inset-0 z-20">
        <motion.div
          style={{ scale: pulse }}
          className="absolute top-0 right-0 origin-right sm:top-[20%] sm:right-auto sm:-left-10 sm:origin-left lg:-left-24 xl:-left-16"
        >
          <FloatingBadge className="pointer-events-auto relative" delay={0.9}>
            <BadgeBody icon={CalendarCheck} tone="bg-brand text-brand-foreground" title="Nytt pass inbokat!" emoji="⚡" sub="med Elin Söderberg" />
          </FloatingBadge>
        </motion.div>
        {/* Bara där brickan får plats bredvid telefonen (md och 2xl); annars skulle den täcka Dagens kost. */}
        <div className="absolute top-[31%] -right-16 hidden md:block lg:hidden 2xl:block">
          <FloatingBadge className="pointer-events-auto relative" delay={1.2} distance={12}>
            <BadgeBody icon={Salad} tone="bg-emerald-400/15 text-emerald-300" title="Kostschema uppdaterat" emoji="🥗" sub="Elin la till nya recept" />
          </FloatingBadge>
        </div>
        <div className="absolute -bottom-3 left-0 sm:bottom-[3%] sm:-left-10 lg:-left-24 xl:-left-16">
          <FloatingBadge className="pointer-events-auto relative" delay={1.5} distance={8}>
            <BadgeBody icon={BadgeCheck} tone="bg-brand/15 text-brand" title="100% verifierade PT:er" emoji="🔥" sub="Certifikat granskas manuellt" />
          </FloatingBadge>
        </div>
        <div className="absolute top-0 right-0 hidden xl:block 2xl:-right-16">
          <FloatingBadge className="pointer-events-auto relative" delay={1.8} distance={9}>
            <BadgeBody icon={PhoneMissed} tone="bg-rose-400/15 text-rose-300" title="Missat samtal – ring upp" emoji="📞" sub="Elin Söderberg · 08:12" />
          </FloatingBadge>
        </div>
        <AnimatePresence>
          {bookings === 0 && (
            <motion.div
              key="hint"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0, transition: { delay: 2.2, duration: 0.6, ease: EASE } }}
              exit={{ opacity: 0, x: 10, transition: { duration: 0.3 } }}
              className="absolute top-[72%] right-0 hidden items-center gap-1.5 text-sm font-medium text-brand xl:flex"
            >
              <svg viewBox="0 0 40 24" className="h-6 w-10" fill="none">
                <path d="M38 4 C 26 4, 14 8, 4 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="3 4" />
                <path d="M4 18 l 7 -1 M4 18 l 1 -7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              Testa att boka
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

/** Innehåll i en flytande bricka: ikon, rubrik (+ emoji) och en rad till på större skärmar. */
function BadgeBody({ icon: Icon, tone, title, emoji, sub }: { icon: LucideIcon; tone: string; title: string; emoji: string; sub: string }) {
  return (
    <>
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-xl", tone)}>
        <Icon className="size-4" />
      </span>
      <span className="leading-tight">
        <span className="block text-[13px] font-semibold whitespace-nowrap">
          {title} <span>{emoji}</span>
        </span>
        <span className="hidden text-[11px] font-normal whitespace-nowrap text-muted-foreground sm:block lg:hidden xl:block">{sub}</span>
      </span>
    </>
  )
}

/** Glöd, en roterande ljusring och en omloppsbana med en grön prick bakom telefonen. */
function Halo({ active }: { active: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 size-[26rem] -translate-x-1/2 -translate-y-1/2 sm:size-[36rem]">
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(closest-side,rgba(172,237,55,0.2),transparent_78%)]" />
      <motion.div
        {...loop(active, SPIN, 40, "linear")}
        className="absolute inset-0 rounded-full opacity-80 [background:conic-gradient(from_0deg,transparent_0deg,var(--brand)_70deg,transparent_150deg,#34d399_230deg,transparent_320deg)] [mask-image:radial-gradient(closest-side,transparent_calc(100%_-_2px),black_calc(100%_-_1px))]"
      />
      <div className="absolute inset-[15%] rounded-full border border-white/[0.07]" />
      <motion.div {...loop(active, SPIN, 16, "linear")} className="absolute inset-[15%]">
        <span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-brand shadow-[0_0_14px_3px] shadow-brand/60" />
      </motion.div>
      <div className="absolute inset-[32%] rounded-full border border-dashed border-white/[0.06]" />
    </div>
  )
}

/** PT:ns dag i kalendern – syns delvis bakom telefonen (dra och släpp för att boka om). */
function PtCalendarCard() {
  return (
    <div className="w-[13.5rem] -rotate-6 rounded-3xl border border-white/10 bg-[#0e1319]/95 p-3.5 text-left shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)]">
      <div className="flex items-center gap-2 text-[11px]">
        <span className="grid size-6 place-items-center rounded-lg bg-brand/15 text-brand">
          <CalendarDays className="size-3.5" />
        </span>
        <span className="font-semibold">Elins kalender</span>
        <span className="ml-auto text-muted-foreground">tis 14</span>
      </div>
      <ul className="mt-3 space-y-1.5 text-[10px]">
        <li className="flex items-center gap-2">
          <span className="w-8 text-muted-foreground tabular-nums">07:00</span>
          <span className="flex-1 rounded-lg bg-white/[0.06] px-2 py-1.5">Johan K. · Helkropp</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="w-8 text-muted-foreground tabular-nums">09:30</span>
          <span className="flex-1 rounded-lg border border-dashed border-white/15 px-2 py-1.5 text-muted-foreground">Ledig tid</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="w-8 text-muted-foreground tabular-nums">12:00</span>
          <span className="flex-1 rounded-lg bg-emerald-400/15 px-2 py-1.5 text-emerald-200">Amir R. · Kostcoaching</span>
        </li>
        <li className="relative flex items-center gap-2">
          <span className="w-8 text-muted-foreground tabular-nums">17:00</span>
          <span className="flex flex-1 translate-x-1.5 -rotate-2 items-center gap-1 rounded-lg bg-brand px-1.5 py-1.5 font-medium text-brand-foreground shadow-lg shadow-black/50">
            <GripVertical className="size-3" />
            Sara L. · Underkropp A
          </span>
          <MousePointer2 className="absolute -bottom-2.5 left-14 size-4 fill-white text-black" />
        </li>
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Telefonens innehåll: klientens startsida                            */
/* ------------------------------------------------------------------ */

function ClientHomeScreen({
  booked,
  tried,
  glareX,
  reduce,
  active,
  onBook,
  onUndo,
}: {
  booked: boolean
  tried: boolean
  glareX: MotionValue<string>
  reduce: boolean
  /** Hjälten syns och "minska rörelse" är av – då får Boka-ringen pulsera. */
  active: boolean
  onBook: () => void
  onUndo: () => void
}) {
  const screenRef = React.useRef<HTMLDivElement>(null)
  const bookRef = React.useRef<HTMLButtonElement>(null)
  const seen = useInView(screenRef, { once: true, margin: "0px 0px -15% 0px" })
  const fire = useConfetti()
  const [lunch, setLunch] = React.useState(false)
  const [toast, setToast] = React.useState<number | null>(null)
  const [status, setStatus] = React.useState("")

  // Notisen överst i telefonen försvinner av sig själv.
  React.useEffect(() => {
    if (toast === null) return
    const id = window.setTimeout(() => setToast(null), 2800)
    return () => window.clearTimeout(id)
  }, [toast])

  const eaten = (k: keyof Nutrients) => BEFORE_LUNCH[k] + (lunch ? LUNCH[k] : 0)
  const kcal = useCountUp(eaten("kcal"), seen, reduce)
  const protein = useCountUp(eaten("protein"), seen, reduce)
  const carbs = useCountUp(eaten("carbs"), seen, reduce)
  const fat = useCountUp(eaten("fat"), seen, reduce)
  const macros: Record<MacroKey, MotionValue<number>> = { protein, carbs, fat }

  const book = () => {
    if (booked) {
      onUndo()
      setStatus(`Bokningen drogs tillbaka. ${PASSES_LEFT} pass kvar.`)
      return
    }
    onBook()
    setToast((n) => (n ?? 0) + 1)
    setStatus(`Nytt pass inbokat torsdag 16 oktober 17.30 med Elin – väntar på bekräftelse. ${PASSES_LEFT - 1} pass kvar.`)
    void fire(bookRef.current, { particles: 90, spread: 80 })
  }

  const toggleLunch = () => {
    setLunch(!lunch)
    setStatus(lunch ? "Lunchen avmarkerad." : `Lunchen avbockad: ${fmt(BEFORE_LUNCH.kcal + LUNCH.kcal)} av ${fmt(TARGET.kcal)} kcal.`)
  }

  return (
    <div role="group" aria-label="Exempel: Coavira-appens startsida för klienter" className="relative text-left">
      <PhoneFrame time="12:08" className="w-[300px]">
        <motion.div
          aria-hidden
          style={{ x: glareX }}
          className="pointer-events-none absolute -inset-y-10 -left-1/2 z-30 w-[200%] bg-[linear-gradient(105deg,transparent_40%,rgba(255,255,255,0.06)_49%,transparent_58%)]"
        />
        <AnimatePresence>{toast !== null && <BookedToast key={toast} />}</AnimatePresence>

        <div ref={screenRef} className="relative h-[572px]">
          <div className="space-y-2.5 px-3.5 pt-1.5">
            {/* Hälsning */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground">Tisdag 14 oktober</p>
                <p className="text-[22px] leading-tight font-bold tracking-tight">Hej Sara!</p>
              </div>
              <div aria-hidden className="flex items-center gap-2">
                <span className="relative grid size-8 place-items-center rounded-full bg-white/[0.06]">
                  <Bell className="size-4" />
                  <span className="absolute top-1.5 right-2 size-1.5 rounded-full bg-brand" />
                </span>
                <span className="grid size-8 place-items-center rounded-full bg-brand/15 text-[11px] font-semibold text-brand">SL</span>
              </div>
            </div>

            {/* Veckoremsa */}
            <ol aria-hidden className="grid grid-cols-7 gap-1">
              {WEEK.map((d) => {
                const isToday = d.date === TODAY
                const planned = ("planned" in d && d.planned) || (d.date === SLOT_DAY && booked)
                return (
                  <li
                    key={d.date}
                    className={cn("flex flex-col items-center gap-0.5 rounded-xl py-1 text-[10px]", isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
                  >
                    <span>{d.day}</span>
                    <span className={cn("text-[13px] leading-none font-semibold tabular-nums", !isToday && "text-foreground")}>{d.date}</span>
                    <span className="grid size-3.5 place-items-center">
                      {"done" in d && d.done ? (
                        <span className="grid size-3.5 place-items-center rounded-full bg-brand text-brand-foreground">
                          <Check className="size-2.5" strokeWidth={3} />
                        </span>
                      ) : (
                        <AnimatePresence initial={false}>
                          {planned && (
                            <motion.span
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0, opacity: 0 }}
                              transition={{ type: "spring", stiffness: 500, damping: 22 }}
                              className={cn("size-3 rounded-full border-[1.5px]", d.date === SLOT_DAY ? "border-brand" : "border-current")}
                            />
                          )}
                        </AnimatePresence>
                      )}
                    </span>
                  </li>
                )
              })}
            </ol>

            {/* Dagens kost */}
            <div className="rounded-2xl border border-white/[0.07] bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold">
                  <Utensils aria-hidden className="size-3.5 text-brand" /> Dagens kost
                </p>
                <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-muted-foreground">Kostschema · Elin</span>
              </div>
              <KcalRow kcal={kcal} eaten={eaten("kcal")} />
              <div className="mt-2.5 grid grid-cols-3 gap-2">
                {MACROS.map((m) => (
                  <MacroMini key={m.key} label={m.label} dot={m.dot} value={macros[m.key]} eaten={eaten(m.key)} target={TARGET[m.key]} />
                ))}
              </div>
              <button
                type="button"
                aria-pressed={lunch}
                onClick={toggleLunch}
                className="mt-2.5 flex h-11 w-full items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-2.5 text-left transition-colors hover:bg-white/[0.07] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <motion.span
                  aria-hidden
                  animate={{ scale: lunch ? [1, 1.25, 1] : 1 }}
                  transition={{ duration: 0.35, ease: EASE }}
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors",
                    lunch ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50"
                  )}
                >
                  {lunch && <Check className="size-3.5" strokeWidth={3} />}
                </motion.span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className={cn("block text-[12px] font-medium", lunch && "text-muted-foreground line-through")}>Lunch</span>
                  <span className="block truncate text-[10px] text-muted-foreground">Kyckling, ris &amp; broccoli</span>
                </span>
                <span className="shrink-0 text-right text-[10px] leading-tight text-muted-foreground tabular-nums">
                  12:00
                  <br />
                  {LUNCH.kcal} kcal
                </span>
              </button>
            </div>

            {/* Schemalagda pass */}
            <div className="rounded-2xl border border-white/[0.07] bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold">
                  <Dumbbell aria-hidden className="size-3.5 text-brand" /> Schemalagda pass
                </p>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-muted-foreground tabular-nums">
                  <span className="relative inline-flex overflow-hidden">
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.span
                        key={booked ? "after" : "before"}
                        initial={{ y: 10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -10, opacity: 0 }}
                        transition={{ duration: 0.3, ease: EASE }}
                        className="inline-block font-semibold text-foreground"
                      >
                        {booked ? PASSES_LEFT - 1 : PASSES_LEFT}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                  pass kvar
                </span>
              </div>

              <div className="mt-2.5 flex items-center gap-2.5 rounded-xl bg-white/[0.03] p-2">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand text-[10px] leading-none font-bold text-brand-foreground tabular-nums">17:00</span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[12px] font-semibold">Underkropp A</span>
                  <span className="block truncate text-[10px] text-muted-foreground">Idag · med Elin</span>
                </span>
                <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">Bekräftat</span>
              </div>

              <div className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-white/10 py-1 pr-1 pl-2.5">
                <div className="relative h-8 min-w-0 flex-1">
                  <AnimatePresence initial={false} mode="popLayout">
                    <motion.div
                      key={booked ? "booked" : "slot"}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.3, ease: EASE }}
                      className="absolute inset-0 flex flex-col justify-center leading-tight"
                    >
                      {booked ? (
                        <span className="flex items-center gap-1 text-[10px] text-warning">
                          <span aria-hidden className="size-1.5 rounded-full bg-warning" />
                          Väntar på Elin
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">Ledig tid hos Elin</span>
                      )}
                      <span className="truncate text-[12px] font-semibold tracking-tight">Tor 16 okt · 17:30</span>
                    </motion.div>
                  </AnimatePresence>
                </div>
                <motion.button
                  ref={bookRef}
                  type="button"
                  onClick={book}
                  whileTap={{ scale: 0.94 }}
                  aria-label={booked ? "Dra tillbaka bokningen torsdag 16 oktober 17.30" : "Boka torsdag 16 oktober 17.30 med Elin"}
                  className={cn(
                    "relative h-11 w-[6.5rem] shrink-0 rounded-xl text-[12px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:outline-none",
                    booked
                      ? "border border-white/15 bg-white/[0.04] text-foreground hover:bg-white/[0.08]"
                      : "bg-brand text-brand-foreground shadow-[0_8px_24px_-8px] shadow-brand/70 hover:bg-brand/90"
                  )}
                >
                  {/* Ringen visar var man trycker; den pulserar bara medan hjälten syns. */}
                  {!booked && !tried && (
                    <span aria-hidden className={cn("absolute -inset-1 rounded-[0.9rem] ring-2 ring-brand/50", active && "motion-safe:animate-pulse")} />
                  )}
                  <span className="relative inline-flex items-center justify-center gap-1.5">
                    {booked ? (
                      "Dra tillbaka"
                    ) : (
                      <>
                        <CalendarPlus aria-hidden className="size-4" />
                        Boka
                      </>
                    )}
                  </span>
                </motion.button>
              </div>
            </div>
          </div>

          <TabBar />
        </div>
      </PhoneFrame>
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
    </div>
  )
}

/** Kalorier mot målet: uppräknande siffra och en grön stapel som växer i takt. */
function KcalRow({ kcal, eaten }: { kcal: MotionValue<number>; eaten: number }) {
  const text = useTransform(kcal, (v) => fmt(v))
  const left = useTransform(kcal, (v) => `${fmt(Math.max(0, TARGET.kcal - v))} kvar`)
  const scaleX = useTransform(kcal, (v) => Math.min(1, v / TARGET.kcal))
  return (
    <>
      <p className="sr-only">
        {fmt(eaten)} av {fmt(TARGET.kcal)} kcal
      </p>
      <div aria-hidden className="mt-2.5 flex items-end justify-between gap-2">
        <p className="leading-none">
          <motion.span className="text-[26px] font-semibold tracking-tight tabular-nums">{text}</motion.span>
          <span className="ml-1 text-[11px] text-muted-foreground">av {fmt(TARGET.kcal)} kcal</span>
        </p>
        <motion.p className="text-[11px] text-muted-foreground tabular-nums">{left}</motion.p>
      </div>
      <div aria-hidden className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/15">
        <motion.div style={{ scaleX }} className="h-full origin-left rounded-full bg-gradient-to-r from-emerald-400 to-brand" />
      </div>
    </>
  )
}

/** Ett makro i miniformat: etikett, värde/mål och en tunn stapel i makrots färg. */
function MacroMini({ label, dot, value, eaten, target }: { label: string; dot: string; value: MotionValue<number>; eaten: number; target: number }) {
  const text = useTransform(value, (v) => fmt(v))
  const scaleX = useTransform(value, (v) => Math.min(1, v / target))
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 truncate text-[10px] text-muted-foreground">
        <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", dot)} />
        {label}
      </p>
      <p className="sr-only">
        {eaten} av {target} gram
      </p>
      <p aria-hidden className="text-[11px] font-medium tabular-nums">
        <motion.span>{text}</motion.span>
        <span className="text-muted-foreground">/{target} g</span>
      </p>
      <div aria-hidden className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.07]">
        <motion.div style={{ scaleX }} className={cn("h-full origin-left rounded-full", dot)} />
      </div>
    </div>
  )
}

/** Notisen som glider ner överst i telefonen efter en bokning. */
function BookedToast() {
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0, y: -44, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -32, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      className="absolute inset-x-2.5 top-2 z-20 flex items-center gap-2.5 rounded-2xl border border-white/10 bg-[#1b222b]/95 p-2.5 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.8)]"
    >
      <BrandMark size="sm" className="rounded-lg" />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-[12px] font-semibold">Nytt pass inbokat! ⚡</span>
        <span className="block truncate text-[10px] text-muted-foreground">Tor 16 okt · 17:30 med Elin</span>
      </span>
      <span className="self-start text-[9px] text-muted-foreground">nu</span>
    </motion.div>
  )
}

/** Appens nedre meny (dekor). */
function TabBar() {
  return (
    <div aria-hidden className="absolute inset-x-0 bottom-0 grid grid-cols-5 border-t border-white/[0.06] bg-background/95 px-1 pt-2 pb-3.5">
      {TABS.map(({ label, icon: Icon, active, dot }) => (
        <span key={label} className={cn("flex flex-col items-center gap-1 text-[9px]", active ? "font-medium text-primary" : "text-muted-foreground")}>
          <span className="relative">
            <Icon className="size-[18px]" />
            {dot && <span className="absolute -top-0.5 -right-1 size-1.5 rounded-full bg-brand" />}
          </span>
          {label}
        </span>
      ))}
      <span className="absolute bottom-1.5 left-1/2 h-1 w-24 -translate-x-1/2 rounded-full bg-white/30" />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Faktabandet                                                         */
/* ------------------------------------------------------------------ */

/** Fart för bandet i pixlar per sekund. */
const MARQUEE_SPEED = 38

/**
 * Rullande band med sanna fakta. Pausas vid hovring, med knappen eller när det
 * inte syns. Med "minska rörelse" står allt still och radbryts i stället.
 * Rullningen är en Web Animation på transform: den körs i kompositorn utan JS
 * per bildruta och står helt still (ingen loop alls) när den är pausad.
 */
function TrustMarquee({ reduce }: { reduce: boolean }) {
  const viewportRef = React.useRef<HTMLDivElement>(null)
  const railRef = React.useRef<HTMLDivElement>(null)
  const trackRef = React.useRef<HTMLUListElement>(null)
  const animRef = React.useRef<Animation | null>(null)
  // Hur långt (0–1) bandet hunnit, så att det fortsätter där det var om bredden ändras.
  const progressRef = React.useRef(0)
  const inView = useInView(viewportRef)
  const [hovered, setHovered] = React.useState(false)
  const [paused, setPaused] = React.useState(false)
  const [width, setWidth] = React.useState(0)
  const running = !reduce && !paused && !hovered && inView

  // Bredden på en uppsättning (bandet hoppar tillbaka exakt så långt).
  React.useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const measure = () => setWidth(el.offsetWidth)
    measure()
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Skapa animationen (pausad) – inte alls med "minska rörelse".
  React.useEffect(() => {
    const rail = railRef.current
    if (!rail || reduce || !width || typeof rail.animate !== "function") return
    const duration = (width / MARQUEE_SPEED) * 1000
    const anim = rail.animate([{ transform: "translateX(0px)" }, { transform: `translateX(${-width}px)` }], { duration, iterations: Infinity, easing: "linear" })
    anim.pause()
    anim.currentTime = progressRef.current * duration
    animRef.current = anim
    return () => {
      progressRef.current = ((Number(anim.currentTime) || 0) % duration) / duration
      anim.cancel()
      animRef.current = null
    }
  }, [reduce, width])

  // Spela bara när bandet syns och ingen har pausat det.
  React.useEffect(() => {
    const anim = animRef.current
    if (!anim) return
    if (running) anim.play()
    else anim.pause()
  }, [running, reduce, width])

  return (
    <div className="relative z-10 border-y border-white/[0.06] bg-white/[0.02]">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-2 sm:px-4">
        <div
          ref={viewportRef}
          onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          className="relative min-w-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_7%,black_93%,transparent)] motion-reduce:[mask-image:none]"
        >
          <div ref={railRef} className="flex w-max motion-reduce:w-full">
            <ul
              ref={trackRef}
              aria-label="Fakta om Coavira"
              className="flex shrink-0 items-center gap-10 py-5 pr-10 motion-reduce:w-full motion-reduce:shrink motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:gap-x-8 motion-reduce:gap-y-3 motion-reduce:pr-0"
            >
              {TRUST.map((t) => (
                <TrustItem key={t.label} {...t} />
              ))}
            </ul>
            <ul aria-hidden className="flex shrink-0 items-center gap-10 py-5 pr-10 motion-reduce:hidden">
              {TRUST.map((t) => (
                <TrustItem key={t.label} {...t} />
              ))}
            </ul>
          </div>
        </div>
        <button
          type="button"
          aria-pressed={paused}
          aria-label="Pausa rullande fakta"
          onClick={() => setPaused((p) => !p)}
          className="grid size-11 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:hidden"
        >
          {paused ? <Play aria-hidden className="size-4" /> : <Pause aria-hidden className="size-4" />}
        </button>
      </div>
    </div>
  )
}

function TrustItem({ label, icon: Icon }: { label: string; icon: LucideIcon }) {
  return (
    <li className="flex shrink-0 items-center gap-2.5 text-sm font-medium whitespace-nowrap text-foreground/85">
      <span className="grid size-7 place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-brand">
        <Icon aria-hidden className="size-3.5" />
      </span>
      {label}
    </li>
  )
}
