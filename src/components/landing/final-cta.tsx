"use client"

/**
 * Avslutningen på landningssidan: en stor uppmaning (#ladda-ned) med
 * App Store-/Google Play-brickor, PT-ansökan och support, app-brickor
 * vid sidan (bara breda skärmar) – och sidfoten med support, sekretesspolicy,
 * användarvillkor och kontakt (det App Store och Google Play kräver).
 *
 * Rörelse (v45): inga oändliga bakgrundsanimationer. Rubriken glider på plats,
 * och från md följer horisonten och brickorna scrollen (bara transform).
 * Telefoner får en stilla bakgrund utan scrollyssnare.
 * Inga inloggningslänkar – Coavira är en mobilapp.
 */
import { animate, motion, useInView, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useTransform, type MotionValue, type Variants } from "framer-motion"
import { ArrowUp, ArrowUpRight, BadgeCheck, CalendarCheck, Check, Dumbbell, LifeBuoy, ShieldCheck, Smartphone, Timer } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { CookieSettingsButton } from "@/components/cookie-banner"
import { BrandMark } from "@/components/brand"
import { LINKS, NAV, STORE_URLS } from "@/components/landing/links"
import { StoreBadges } from "@/components/landing/store-badges"
import { EASE, Eyebrow, fadeUp, GradientText, stagger } from "@/components/landing/primitives"
import { BRAND } from "@/lib/brand"
import { cn } from "@/lib/utils"

const SECTION_ID = "ladda-ned"
const TITLE_ID = `${SECTION_ID}-title`
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"

/** Ingen butiksadress än = apparna är inte publicerade (brickorna visar "Släpps snart"). */
const COMING_SOON = !STORE_URLS.ios && !STORE_URLS.android

const WORD: Variants = {
  hidden: { opacity: 0, y: "105%" },
  show: { opacity: 1, y: "0%", transition: { duration: 0.9, ease: EASE } },
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
/* Bakgrund: ett svagt ljus och en horisont                            */
/* ------------------------------------------------------------------ */

function CtaBackdrop({ progress, parallax }: { progress: MotionValue<number>; parallax: boolean }) {
  // Horisonten stiger in när sektionen scrollas fram (bara från md).
  const rise = useTransform(progress, [0, 0.55], ["22%", "0%"])

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* Mjuk övergång från sektionen ovanför. */}
      <div className="absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-background to-transparent sm:h-40" />

      {/* Ett enda stilla ljus bakom rubriken (radiell gradient, inget blur-filter). */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_55%_42%_at_50%_40%,rgba(132,204,22,0.09),transparent_70%)]" />

      {/* Horisont: en jättecirkel i bakgrundsfärg med en tunn kant i accentfärgen. */}
      <motion.div
        style={parallax ? { y: rise } : undefined}
        className="absolute top-[90%] left-1/2 aspect-square w-[max(150%,60rem)] -translate-x-1/2 rounded-full border-t border-brand/35 bg-[radial-gradient(ellipse_45%_10%_at_50%_0%,rgba(132,204,22,0.12),transparent),linear-gradient(#131916,#131916)] sm:top-[84%]"
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* App-brickor vid sidan (exempeldata, bara på breda skärmar)          */
/* ------------------------------------------------------------------ */

/** En bricka som tonar in en gång och sedan följer scrollen med lite djup (parallax). */
function FloatTile({
  children,
  className,
  depth,
  delay,
  progress,
  parallax,
}: {
  children: React.ReactNode
  className?: string
  depth: number
  delay: number
  progress: MotionValue<number>
  parallax: boolean
}) {
  const y = useTransform(progress, [0, 1], [depth, -depth])
  return (
    <motion.div style={parallax ? { y } : undefined} className={cn("absolute", className)}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 20 }}
        whileInView={{ opacity: 1, scale: 1, y: 0 }}
        viewport={{ once: true, margin: "-10% 0px" }}
        transition={{ duration: 0.9, ease: EASE, delay }}
      >
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-card text-foreground shadow-xl shadow-black/30">{children}</div>
      </motion.div>
    </motion.div>
  )
}

function BookingTile() {
  return (
    <div className="flex items-center gap-3 p-3 pr-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-brand-foreground">
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
      <p className="mt-2 text-sm font-semibold">Back Squat</p>
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
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-bold text-brand-foreground">ES</span>
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
  const shared = { progress, parallax }
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
/* Rubriken                                                            */
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
      className="text-[2.5rem] leading-[0.98] font-bold tracking-[-0.045em] text-balance sm:text-7xl md:text-8xl xl:text-[7rem]"
    >
      <span className="block">
        <Word>Din</Word> <Word>resa</Word>
      </span>{" "}
      <span className="inline-block">
        <Word>
          <GradientText>börjar nu.</GradientText>
        </Word>
      </span>
    </motion.h2>
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

/** Sidans sista uppmaning: rubrik, butiksbrickor, PT/support och trygghetsrad. */
export function FinalCta() {
  const ref = React.useRef<HTMLElement>(null)
  // Hydreringssäkra: falska på servern och vid första renderingen, följer sedan inställningen live.
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)")
  const desktop = useMediaQuery("(min-width: 48rem)")
  const wide = useMediaQuery("(min-width: 80rem)")
  const inView = useInView(ref, { margin: "-10% 0px" })
  // Vilotimern i passbrickan räknar bara när sektionen syns; scrollkopplad parallax bara från md.
  const active = inView && !reduce
  const parallax = desktop && !reduce
  const progress = useMotionValue(0)

  return (
    <section
      ref={ref}
      id={SECTION_ID}
      aria-labelledby={TITLE_ID}
      className="relative isolate scroll-mt-24 overflow-hidden px-4 pt-16 pb-16 sm:px-6 sm:pt-28 sm:pb-32 md:pt-36 md:pb-40 lg:pt-44 lg:pb-48"
    >
      {parallax && <ScrollLink target={ref} progress={progress} />}
      <CtaBackdrop progress={progress} parallax={parallax} />

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
            <StoreBadges size={desktop ? "lg" : "md"} align="center" />
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
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
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
