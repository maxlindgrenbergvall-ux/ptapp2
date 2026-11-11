"use client"

/**
 * Byggstenar för landningssidan: sektioner, glaskort, accenttext,
 * scroll-animationer (framer-motion), telefonmockup och brickor.
 * Allt respekterar "minska rörelse" (MotionConfig i LandingShell).
 *
 * Rörelse (v45): en enda kurva (EASE) och bara transform + opacity. Saker
 * tonar in och glider på plats en gång – inget svävar, pulserar eller snurrar
 * i bakgrunden. Det som rör sig gör det för att visa något (en demo, ett läge).
 */
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useScroll, type HTMLMotionProps, type MotionValue, type Variants } from "framer-motion"
import * as React from "react"

import { cn } from "@/lib/utils"

/** Sidans enda kurva: snabb start, lång mjuk inbromsning (samma som --landing-ease i globals.css). */
export const EASE = [0.22, 1, 0.36, 1] as const
/** Hur länge något tonar in och hur långt det glider. */
const ENTER_DURATION = 0.8
const ENTER_DISTANCE = 20

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: ENTER_DISTANCE },
  show: { opacity: 1, y: 0, transition: { duration: ENTER_DURATION, ease: EASE } },
}

export const stagger = (step = 0.08, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: step, delayChildren: delay } },
})

/** Tonar in och glider upp när elementet kommer in i bild (en gång). */
export function Reveal({
  children,
  delay = 0,
  y = ENTER_DISTANCE,
  className,
  ...rest
}: { children: React.ReactNode; delay?: number; y?: number; className?: string } & Omit<HTMLMotionProps<"div">, "children">) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: ENTER_DURATION, ease: EASE, delay }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  )
}

/** Barnen (StaggerItem) tonar in ett i taget när gruppen syns. */
export function Stagger({ children, className, step = 0.08, delay = 0 }: { children: React.ReactNode; className?: string; step?: number; delay?: number }) {
  return (
    <motion.div variants={stagger(step, delay)} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} className={className}>
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className, ...rest }: { children: React.ReactNode; className?: string } & Omit<HTMLMotionProps<"div">, "children">) {
  return (
    <motion.div variants={fadeUp} className={className} {...rest}>
      {children}
    </motion.div>
  )
}

/** Ordet som bär rubriken, i accentfärgen (en ren färg – ingen gradient). */
export function GradientText({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("text-brand", className)}>{children}</span>
}

/** Liten etikett ovanför en sektionsrubrik. */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium tracking-[0.08em] text-brand uppercase",
        className
      )}
    >
      <span className="size-1.5 rounded-full bg-brand" aria-hidden />
      {children}
    </span>
  )
}

/**
 * En sektion med valfri etikett, rubrik och ingress. `id` används av
 * menyns ankarlänkar (scroll-margin för den fasta menyn).
 */
export function Section({
  id,
  eyebrow,
  title,
  intro,
  children,
  className,
  align = "center",
}: {
  id?: string
  eyebrow?: React.ReactNode
  title?: React.ReactNode
  intro?: React.ReactNode
  children?: React.ReactNode
  className?: string
  align?: "center" | "left"
}) {
  const titleId = id ? `${id}-title` : undefined
  return (
    // Mobil: kompakt luft så att sidan inte blir lång att scrolla; generöst från lg så att varje sektion får andas.
    <section id={id} aria-labelledby={title ? titleId : undefined} className={cn("relative scroll-mt-24 px-4 py-12 sm:px-6 sm:py-24 lg:py-32", className)}>
      <div className="mx-auto max-w-6xl">
        {(eyebrow || title || intro) && (
          <Reveal className={cn("mb-8 max-w-3xl sm:mb-14 lg:mb-16", align === "center" && "mx-auto text-center")}>
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            {title && (
              <h2 id={titleId} className="mt-3 text-[2rem] leading-[1.05] font-semibold tracking-[-0.03em] text-balance sm:mt-5 sm:text-5xl md:text-6xl lg:text-5xl xl:text-[3.5rem]">
                {title}
              </h2>
            )}
            {intro && <p className="mt-3 text-base leading-relaxed text-pretty text-muted-foreground sm:mt-5 sm:text-lg md:text-xl">{intro}</p>}
          </Reveal>
        )}
        {children}
      </div>
    </section>
  )
}

/** Glaskort: halvgenomskinligt med fin kant. Suddig bakgrund bara från md – backdrop-filter är dyrt att scrolla på telefoner. */
export const GlassCard = React.forwardRef<HTMLDivElement, { children?: React.ReactNode; className?: string } & Omit<HTMLMotionProps<"div">, "children">>(
  function GlassCard({ children, className, ...rest }, ref) {
    return (
      <motion.div
        ref={ref}
        className={cn("relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.05] shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset] md:bg-white/[0.04] md:backdrop-blur-md", className)}
        {...rest}
      >
        {children}
      </motion.div>
    )
  }
)

/**
 * Kort som får ett svagt ljus där pekaren är. Ljuset är neutralt (textfärgen
 * på några procent), så att kortets innehåll förblir det som syns. Bara med
 * mus – på touch och med "minska rörelse" händer ingenting.
 */
export function SpotlightCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const light = useMotionTemplate`radial-gradient(420px circle at ${x}px ${y}px, rgb(249 251 248 / 0.055), transparent 65%)`
  return (
    <div
      className={cn("group relative", className)}
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== "mouse") return
        const r = e.currentTarget.getBoundingClientRect()
        x.set(e.clientX - r.left)
        y.set(e.clientY - r.top)
      }}
    >
      {children}
      <motion.div aria-hidden style={{ background: light }} className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-500 group-hover:opacity-100 motion-reduce:hidden" />
    </div>
  )
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
 * Följer scrollen: innehållet (t.ex. en telefonmockup) glider upp och växer en
 * aning medan det kommer in i bild, och står sedan still. Bara transform, och
 * framer-motion läser scrollen passivt en gång per bildruta.
 *
 * Viloläget (ingen förskjutning) är utgångspunkten: det är vad servern skickar
 * och vad som gäller på telefoner, med "minska rörelse" och utan JavaScript.
 * Kopplingen till scrollen (ScrollRiseLink) monteras bara från md och bara när
 * rörelse är tillåten – telefoner har alltså ingen scroll-lyssnare.
 */
export function ScrollRise({ children, className, distance = 36, from = 0.955 }: { children: React.ReactNode; className?: string; distance?: number; from?: number }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const fromMd = useFromMd()
  const y = useMotionValue(0)
  const scale = useMotionValue(1)
  return (
    <div ref={ref} className={className}>
      <motion.div style={{ y, scale }} className="transform-gpu">
        {children}
      </motion.div>
      {/* Syskon efter innehållet: då är ref:en satt när useScroll startar. */}
      {fromMd && !reduce && <ScrollRiseLink target={ref} y={y} scale={scale} distance={distance} from={from} />}
    </div>
  )
}

function ScrollRiseLink({
  target,
  y,
  scale,
  distance,
  from,
}: {
  target: React.RefObject<HTMLDivElement | null>
  y: MotionValue<number>
  scale: MotionValue<number>
  distance: number
  from: number
}) {
  const { scrollYProgress } = useScroll({ target, offset: ["start end", "center 62%"] })
  React.useEffect(() => {
    const apply = (v: number) => {
      // Kubisk inbromsning: det mesta av rörelsen sker tidigt, sista biten landar mjukt.
      const eased = 1 - (1 - v) ** 3
      y.set(distance * (1 - eased))
      scale.set(from + (1 - from) * eased)
    }
    apply(scrollYProgress.get())
    const off = scrollYProgress.on("change", apply)
    // Tillbaka till viloläget om fönstret krymper under md eller "minska rörelse" slås på.
    return () => {
      off()
      y.set(0)
      scale.set(1)
    }
  }, [scrollYProgress, y, scale, distance, from])
  return null
}

/** Ett svagt ljus i accentfärgen bakom innehållet. Används sparsamt – högst ett per sektion. */
export function GlowOrb({ className }: { className?: string }) {
  // Radiell gradient i stället för filter: blur(120px) – samma mjuka sken, men
  // ingen filterpass som måste räknas om vid varje scroll (stor vinst på mobil).
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brand)_9%,transparent),transparent)]",
        className
      )}
    />
  )
}

/**
 * Telefonmockup med statusfält. Innehållet ritas med appens egna färger och
 * komponenter, så att det ser ut som Coavira-appen.
 */
export function PhoneFrame({ children, className, time = "09:41" }: { children: React.ReactNode; className?: string; time?: string }) {
  return (
    <div
      className={cn(
        "relative w-[280px] rounded-[2.75rem] border border-white/15 bg-[#0b0f0d] p-2.5 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.04)_inset] sm:w-[300px]",
        className
      )}
    >
      <div className="relative overflow-hidden rounded-[2.25rem] bg-background">
        <div className="flex items-center justify-between px-6 pt-3 pb-1 text-[11px] font-semibold tabular-nums">
          <span>{time}</span>
          <span aria-hidden className="absolute top-2 left-1/2 h-6 w-24 -translate-x-1/2 rounded-full bg-black" />
          <span className="flex items-center gap-1" aria-hidden>
            <span className="h-2 w-3 rounded-[2px] border border-current opacity-80" />
          </span>
        </div>
        {children}
      </div>
    </div>
  )
}

/**
 * Liten bricka bredvid en mockup (t.ex. "Nytt pass inbokat!"). Tonar in och
 * glider på plats en gång när den syns, och står sedan still. `delay`
 * förskjuter intoningen så att brickorna kommer i tur och ordning.
 */
export function FloatingBadge({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 10 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: ENTER_DURATION, ease: EASE, delay }}
      className={cn("absolute z-10", className)}
    >
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-card/95 px-3 py-2 text-sm font-medium shadow-xl shadow-black/30">{children}</div>
    </motion.div>
  )
}
