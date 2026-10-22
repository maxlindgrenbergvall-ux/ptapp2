"use client"

/**
 * Avslutningen på landningssidan: en stor uppmaning (#ladda-ned) med
 * pulserande App Store-/Google Play-brickor, PT-ansökan och support,
 * flytande app-brickor (bara breda skärmar) – och sidfoten med support,
 * sekretesspolicy, användarvillkor och kontakt (det App Store och Google Play kräver).
 *
 * Prestanda: alla oändliga animationer är CSS på transform/opacitet (körs på
 * kompositorn utan JavaScript per bildruta) och startar bara när sektionen syns
 * och "minska rörelse" är av. Scrollkopplad parallax finns bara från md – telefoner
 * får en stilla, enklare bakgrund utan scrollyssnare, blur-filter eller stora skuggor.
 * Inga inloggningslänkar – Coavira är en mobilapp.
 */
import { animate, motion, useInView, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue, type Variants } from "framer-motion"
import { ArrowUp, ArrowUpRight, BadgeCheck, CalendarCheck, Check, Dumbbell, LifeBuoy, ShieldCheck, Smartphone, Timer } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { CookieSettingsButton } from "@/components/analytics/analytics"
import { BrandMark } from "@/components/brand"
import { LINKS, NAV, STORE_URLS } from "@/components/landing/links"
import { StoreBadges } from "@/components/landing/store-badges"
import { EASE, Eyebrow, fadeUp, GradientText, stagger } from "@/components/landing/primitives"
import { BRAND } from "@/lib/brand"
import { cn } from "@/lib/utils"

const SECTION_ID = "ladda-ned"
const TITLE_ID = `${SECTION_ID}-title`
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
const SPOT_SPRING = { stiffness: 140, damping: 22, mass: 0.6 }
const MAGNET_SPRING = { stiffness: 260, damping: 18, mass: 0.4 }

/** Ingen butiksadress än = apparna är inte publicerade (brickorna visar "Släpps snart"). */
const COMING_SOON = !STORE_URLS.ios && !STORE_URLS.android

// Nyckelbilderna cta-ring och cta-drift ligger i globals.css (bara transform och opacitet).

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
 * Kopplar sektionens scrollförlopp till `progress`. Monteras bara från md (och utan
 * "minska rörelse"), så telefoner slipper scrollyssnaren helt.
 */
function ScrollLink({ target, progress }: { target: React.RefObject<HTMLElement | null>; progress: MotionValue<number> }) {
  const { scrollYProgress } = useScroll({ target, offset: ["start end", "end start"] })
  useMotionValueEvent(scrollYProgress, "change", (v) => progress.set(v))
  return null
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
/* Bakgrund: norrsken, rutnät, stjärnor och en glödande horisont       */
/* ------------------------------------------------------------------ */

/** Små gnistor på fasta platser (deterministiskt – ingen slump i render). Bara från md. */
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

const GRID_BG =
  "[background-image:linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:56px_56px]"

function CtaBackdrop({ active, progress, parallax }: { active: boolean; progress: MotionValue<number>; parallax: boolean }) {
  // Horisonten stiger in och norrskenet glider när sektionen scrollas fram (bara från md).
  const rise = useTransform(progress, [0, 0.55], ["22%", "0%"])
  const auroraY = useTransform(progress, [0, 1], [80, -80])

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Mjuk övergång från sektionen ovanför. */}
      <div className="absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-background to-transparent sm:h-40" />

      {/* Rutnät: stilla på telefoner; från md glider det nedåt med CSS (bara transform). Masken ligger still. */}
      <div className="absolute inset-0 [mask-image:radial-gradient(ellipse_75%_60%_at_50%_42%,black_10%,transparent_72%)]">
        <div className={cn("absolute inset-x-0 -top-14 bottom-0", GRID_BG, active && "md:transform-gpu md:animate-[cta-drift_9s_linear_infinite]")} />
      </div>

      {/* Telefoner: ett stilla färgfält i stället för roterande lager. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_40%_at_35%_32%,rgba(172,237,55,0.12),transparent_70%),radial-gradient(ellipse_60%_36%_at_72%_52%,rgba(16,185,129,0.1),transparent_70%)] md:hidden" />

      {/* Norrsken från md: radiella fält (ingen blur) som roterar åt varsitt håll med CSS. */}
      <motion.div style={parallax ? { y: auroraY } : undefined} className="absolute top-[40%] left-1/2 hidden size-[72rem] -translate-x-1/2 -translate-y-1/2 md:block">
        <div
          className={cn(
            "absolute inset-0 rounded-full bg-[radial-gradient(ellipse_38%_30%_at_32%_34%,rgba(172,237,55,0.22),transparent_70%),radial-gradient(ellipse_34%_28%_at_70%_62%,rgba(16,185,129,0.2),transparent_70%)]",
            active && "transform-gpu animate-[spin_70s_linear_infinite]"
          )}
        />
        <div
          className={cn(
            "absolute inset-[12%] rounded-full bg-[radial-gradient(ellipse_40%_26%_at_62%_28%,rgba(110,231,183,0.16),transparent_70%),radial-gradient(ellipse_30%_34%_at_30%_72%,rgba(172,237,55,0.12),transparent_70%)]",
            active && "transform-gpu animate-[spin_48s_linear_infinite_reverse]"
          )}
        />
      </motion.div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_55%_42%_at_50%_42%,rgba(172,237,55,0.1),transparent_70%)]" />

      {/* Gnistor från md: bara opaciteten pulserar (ingen skugga att måla om). */}
      <div className="absolute inset-0 hidden md:block">
        {STARS.map((s) => (
          <span
            key={`${s.top}-${s.left}`}
            style={{ top: s.top, left: s.left, width: s.size, height: s.size, animationDelay: s.delay }}
            className={cn("absolute rounded-full bg-brand/80", active && "animate-pulse")}
          />
        ))}
      </div>

      {/* Horisont: en jättecirkel i bakgrundsfärg med glödande överkant. */}
      <motion.div
        style={parallax ? { y: rise } : undefined}
        className="absolute top-[64%] left-1/2 aspect-square w-[max(150%,60rem)] -translate-x-1/2 rounded-full border-t border-brand/45 bg-[radial-gradient(ellipse_45%_12%_at_50%_0%,rgba(172,237,55,0.2),transparent),linear-gradient(#0a0d12,#0a0d12)] sm:top-[70%]"
      >
        {/* Skenet över kanten: radiell gradient i stället för en stor box-shadow. */}
        <div className="absolute -top-28 left-1/2 h-56 w-[min(70rem,60%)] -translate-x-1/2 bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brand)_20%,transparent),transparent)]" />
      </motion.div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Flytande app-brickor (exempeldata, bara på breda skärmar)           */
/* ------------------------------------------------------------------ */

/** En bricka med parallax (djup), intoning i bild och en lugn svävning (CSS, .landing-float). */
function FloatTile({
  children,
  className,
  depth,
  delay,
  active,
  progress,
  parallax,
}: {
  children: React.ReactNode
  className?: string
  depth: number
  delay: number
  active: boolean
  progress: MotionValue<number>
  parallax: boolean
}) {
  const y = useTransform(progress, [0, 1], [depth, -depth])
  return (
    <motion.div style={parallax ? { y } : undefined} className={cn("absolute", className)}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 28 }}
        whileInView={{ opacity: 1, scale: 1, y: 0 }}
        viewport={{ once: true, margin: "-10% 0px" }}
        transition={{ duration: 0.9, ease: EASE, delay }}
      >
        {/* Svävandet är transform (CSS), förstoringen vid hover CSS-egenskapen scale – de krockar inte. */}
        <div
          style={{ "--float-y": "-10px", "--float-dur": `${6 + delay * 4}s`, "--float-delay": `${delay}s` } as React.CSSProperties}
          className={cn(
            "pointer-events-auto overflow-hidden rounded-2xl border border-white/10 bg-[#0f141b]/85 text-foreground shadow-2xl shadow-black/50 transition-[scale] duration-300 hover:scale-[1.04] motion-reduce:transition-none md:backdrop-blur-md",
            active && "landing-float"
          )}
        >
          {children}
        </div>
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

const REST_SECONDS = 90

/** Passloggaren i miniformat: set, kg, reps och en vilotimer som tickar ner. */
function WorkoutTile({ active }: { active: boolean }) {
  const rest = useMotionValue(REST_SECONDS)
  const restLabel = useTransform(rest, (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`)
  // En tick per sekund (ingen loop per bildruta) och bara när sektionen syns.
  React.useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => rest.set(rest.get() <= 0 ? REST_SECONDS : rest.get() - 1), 1000)
    return () => window.clearInterval(id)
  }, [rest, active])
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
 * utanför skärmen och inga dolda animationer körs på mobilen.
 */
function FloatingTiles({ active, progress, parallax, reduce }: { active: boolean; progress: MotionValue<number>; parallax: boolean; reduce: boolean }) {
  const shared = { active, progress, parallax }
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
/* Rubrik och de pulserande brickorna                                  */
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
      className="text-[2.5rem] leading-[0.98] font-extrabold tracking-[-0.04em] text-balance sm:text-7xl md:text-8xl xl:text-[7.25rem]"
    >
      <span className="block">
        <Word>Din</Word> <Word>resa</Word>
      </span>{" "}
      <span className="relative inline-block">
        <Word>
          <GradientText>börjar nu.</GradientText>
        </Word>
        <svg aria-hidden viewBox="0 0 300 20" preserveAspectRatio="none" className="pointer-events-none absolute -bottom-[0.04em] left-[4%] h-[0.16em] w-[92%] text-brand/80">
          <motion.path variants={SWOOSH} d="M3 14 C 80 4, 180 2, 297 10" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </span>
    </motion.h2>
  )
}

/**
 * Sidans sista och största uppmaning: butiksbrickorna i ett pulserande grönt
 * sken som dras en aning mot muspekaren. Klick öppnar butiken (eller
 * "Släpps snart" innan apparna är publicerade).
 */
function DownloadBadges({ active, reduce, size }: { active: boolean; reduce: boolean; size: "md" | "lg" }) {
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const x = useSpring(mx, MAGNET_SPRING)
  const y = useSpring(my, MAGNET_SPRING)

  return (
    <motion.div
      style={{ x, y }}
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== "mouse") return
        const r = e.currentTarget.getBoundingClientRect()
        mx.set((e.clientX - (r.left + r.width / 2)) * 0.12)
        my.set((e.clientY - (r.top + r.height / 2)) * 0.25)
      }}
      onPointerLeave={() => {
        mx.set(0)
        my.set(0)
      }}
      className="group relative"
    >
      {/* Skenet: radiell gradient (inget blur-filter) vars opacitet andas med CSS. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -inset-x-10 -inset-y-8 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brand)_40%,transparent),transparent)] opacity-80",
          active && "transform-gpu animate-[pulse_2.6s_cubic-bezier(0.4,0,0.6,1)_infinite]"
        )}
      />
      {/* Ringar som vidgas och tonar ut – CSS på transform/opacitet, bara från md. */}
      {active &&
        [0, 1].map((i) => (
          <span
            key={i}
            aria-hidden
            style={{ animationDelay: `${i * 1.2}s` }}
            className="pointer-events-none absolute -inset-2 hidden transform-gpu animate-[cta-ring_2.4s_ease-out_infinite] rounded-[24px] border-2 border-brand/60 opacity-0 md:block"
          />
        ))}
      <div className="relative">
        <StoreBadges size={size} align="center" />
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/* PT-ansökan, support och trygghetsrad                                */
/* ------------------------------------------------------------------ */

/** PT-vägen och support under brickorna (inga inloggningslänkar – Coavira är en app). */
const ROW_LINK = cn("group inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm text-muted-foreground transition-colors hover:text-foreground", FOCUS)
const ROW_LABEL = "font-semibold text-foreground underline decoration-white/25 underline-offset-4 transition-colors group-hover:decoration-brand"

function SecondaryLinks() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4">
      {/* PT-konton skapas av Coavira efter manuell granskning av certifikat – ansökan sker via e-post. */}
      <a href={LINKS.ptApply} className={ROW_LINK}>
        <BadgeCheck aria-hidden className="size-4 text-brand" />
        Är du PT?
        <span className={ROW_LABEL}>Ansök om att coacha</span>
        <span className="sr-only"> (öppnar e-post)</span>
        <ArrowUpRight aria-hidden className="size-3.5 opacity-60 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </a>
      <Link href={LINKS.support} className={ROW_LINK}>
        <LifeBuoy aria-hidden className="size-4 text-brand" />
        Frågor?
        <span className={ROW_LABEL}>Support</span>
      </Link>
    </div>
  )
}

const TRUST = [
  { icon: BadgeCheck, text: "Verifierade PT:er" },
  { icon: ShieldCheck, text: "Hälsodata bara med ditt samtycke" },
  { icon: Smartphone, text: "iPhone & Android" },
] as const

/* ------------------------------------------------------------------ */
/* FinalCta                                                            */
/* ------------------------------------------------------------------ */

/** Sidans sista uppmaning: rubrik, pulserande butiksbrickor, PT/support och trygghetsrad. */
export function FinalCta() {
  const ref = React.useRef<HTMLElement>(null)
  // Hydreringssäkra: falska på servern och vid första renderingen, följer sedan inställningen live.
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)")
  const desktop = useMediaQuery("(min-width: 48rem)")
  const wide = useMediaQuery("(min-width: 80rem)")
  const inView = useInView(ref, { margin: "-10% 0px" })
  // Oändliga animationer bara när sektionen syns; scrollkopplad parallax bara från md.
  const active = inView && !reduce
  const parallax = desktop && !reduce
  const progress = useMotionValue(0)
  // Ett mjukt ljus som följer muspekaren (bara transform/opacitet, bara från md).
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
      className="relative isolate scroll-mt-24 overflow-hidden px-4 pt-16 pb-16 sm:px-6 sm:pt-28 sm:pb-32 md:pt-36 md:pb-40 lg:pt-44 lg:pb-48"
    >
      {parallax && <ScrollLink target={ref} progress={progress} />}
      <CtaBackdrop active={active} progress={progress} parallax={parallax} />
      <motion.div
        aria-hidden
        style={{ x: spotX, y: spotY, opacity: spotOpacity }}
        className="pointer-events-none absolute top-0 left-0 -z-10 hidden size-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(172,237,55,0.1),transparent)] md:block"
      />

      <div className="relative mx-auto max-w-7xl">
        {wide && <FloatingTiles active={active} progress={progress} parallax={parallax} reduce={reduce} />}

        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger(0.11)}
          className="relative z-10 mx-auto flex max-w-4xl flex-col items-center gap-6 text-center sm:gap-10"
        >
          <motion.div variants={fadeUp}>
            <Eyebrow>Ditt första steg</Eyebrow>
          </motion.div>

          <Headline />

          <motion.p variants={fadeUp} className="max-w-xl text-base text-pretty text-muted-foreground sm:text-xl">
            Ladda ned Coavira <span className="font-semibold text-foreground">gratis</span> och träna med din PT – var du än är.
          </motion.p>

          <motion.div variants={fadeUp} className="flex w-full flex-col items-center gap-3 sm:gap-4">
            {/* Mindre brickor på telefoner så att båda ryms på en rad. */}
            <DownloadBadges active={active} reduce={reduce} size={desktop ? "lg" : "md"} />
            {COMING_SOON && <p className="text-sm text-muted-foreground">Appen släpps snart.</p>}
          </motion.div>

          <motion.div variants={fadeUp} className="flex w-full justify-center">
            <SecondaryLinks />
          </motion.div>

          <motion.ul variants={fadeUp} className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground sm:gap-x-6">
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

type FooterLink = { label: string; href: string; kind: "anchor" | "route" | "mail" }

const PRODUCT_LINKS: readonly FooterLink[] = NAV.map((item) => ({ label: item.label, href: item.href, kind: "anchor" }))

const APP_LINKS: readonly FooterLink[] = [
  { label: "Ladda ned appen", href: LINKS.download, kind: "anchor" },
  { label: "Ansök som PT", href: LINKS.ptApply, kind: "mail" },
  { label: "Support", href: LINKS.support, kind: "route" },
]

/** Det App Store och Google Play kräver: integritet, villkor och kontakt. */
const LEGAL_LINKS: readonly FooterLink[] = [
  { label: "Sekretesspolicy", href: LINKS.privacy, kind: "route" },
  { label: "Användarvillkor", href: LINKS.terms, kind: "route" },
  { label: "Kontakt", href: LINKS.contact, kind: "mail" },
]

const FOOTER_CHIPS = [
  { icon: BadgeCheck, text: "Verifierade PT:er" },
  { icon: Smartphone, text: "För iPhone och Android" },
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
      <ul className="mt-2 md:mt-3">
        {links.map((link) => (
          <li key={link.label}>
            <FooterLinkItem link={link} reduce={reduce} />
          </li>
        ))}
      </ul>
    </motion.div>
  )
}

/**
 * Sidfoten: logga, länkkolumner, stort ordmärke och copyright. På telefoner kompakt:
 * logga + en rad, två korta kolumner (Appen, Juridik & kontakt) och inget ordmärke.
 */
export function LandingFooter() {
  const reduce = !!useReducedMotion()
  return (
    <footer className="relative isolate overflow-hidden px-4 pt-12 pb-[calc(1.5rem+var(--safe-bottom))] sm:px-6 sm:pt-24 sm:pb-[calc(2rem+var(--safe-bottom))]">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/50 to-transparent" />
        <div className="absolute -top-40 left-1/2 h-72 w-[min(56rem,100%)] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(172,237,55,0.1),transparent)]" />
      </div>
      <h2 className="sr-only">Sidfot</h2>

      <div className="mx-auto max-w-6xl">
        <div className="grid gap-8 md:gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] lg:gap-16">
          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-40px" }}
            variants={stagger(0.08)}
            className="max-w-sm space-y-1 md:space-y-5"
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
              Träning, kost och din PT – i en app.
            </motion.p>
            <motion.ul variants={fadeUp} className="hidden flex-wrap gap-2 md:flex">
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
            className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-3"
          >
            {/* Menyns ankare finns redan i den fasta menyn – på telefoner hoppar vi över dem här. */}
            <FooterColumn title="Produkt" links={PRODUCT_LINKS} reduce={reduce} className="hidden md:block" />
            <FooterColumn title="Appen" links={APP_LINKS} reduce={reduce} />
            <FooterColumn title="Juridik & kontakt" links={LEGAL_LINKS} reduce={reduce} />
          </motion.nav>
        </div>

        <motion.div
          aria-hidden
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          variants={stagger(0.05)}
          className="pointer-events-none mt-20 hidden justify-center overflow-hidden text-[22vw] leading-[0.85] font-extrabold tracking-[-0.06em] select-none md:flex xl:text-[15rem]"
        >
          {WORDMARK.map((ch, i) => (
            <motion.span key={`${ch}-${i}`} variants={LETTER} className="inline-block bg-gradient-to-b from-white/[0.14] via-white/[0.05] to-transparent bg-clip-text pb-[0.06em] text-transparent">
              {ch}
            </motion.span>
          ))}
        </motion.div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-x-6 border-t border-white/10 pt-3 text-xs text-muted-foreground sm:text-sm md:mt-0 md:pt-6">
          <p>© 2026 {BRAND.name}</p>
          <CookieSettingsButton className="min-h-11 underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring" />
          <p className="order-last w-full sm:order-none sm:w-auto">
            Byggt i Sverige <span aria-hidden>🇸🇪</span> · Data lagras inom EU
          </p>
          <a
            href="#innehall"
            onClick={(e) => jumpTo(e, "#innehall", reduce, "hero-title")}
            className={cn("group inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-medium text-foreground/85 transition-colors hover:text-foreground", FOCUS)}
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
