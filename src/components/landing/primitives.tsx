"use client"

/**
 * Byggstenar för landningssidan: sektioner, glaskort, gradienttext,
 * scroll-animationer (framer-motion), telefonmockup, flytande brickor och
 * konfetti. Allt respekterar "minska rörelse" (MotionConfig i LandingShell).
 */
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform, type HTMLMotionProps, type Variants } from "framer-motion"
import * as React from "react"

import { cn } from "@/lib/utils"

/** Mjuk "expo-out" som används för alla in-animationer. */
export const EASE = [0.22, 1, 0.36, 1] as const

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
}

export const stagger = (step = 0.08, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: step, delayChildren: delay } },
})

/** Tonar in och glider upp när elementet kommer in i bild (en gång). */
export function Reveal({
  children,
  delay = 0,
  y = 24,
  className,
  ...rest
}: { children: React.ReactNode; delay?: number; y?: number; className?: string } & Omit<HTMLMotionProps<"div">, "children">) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, ease: EASE, delay }}
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

/** Gradienttext i Coaviras gröna toner (lime → smaragd). */
export function GradientText({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("bg-gradient-to-r from-brand via-emerald-300 to-emerald-500 bg-clip-text text-transparent [-webkit-box-decoration-break:clone] [box-decoration-break:clone]", className)}>
      {children}
    </span>
  )
}

/** Liten etikett ovanför en sektionsrubrik. */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium tracking-wide text-brand uppercase backdrop-blur-md",
        className
      )}
    >
      <span className="size-1.5 rounded-full bg-brand shadow-[0_0_12px_2px] shadow-brand/60" aria-hidden />
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
    <section id={id} aria-labelledby={title ? titleId : undefined} className={cn("relative scroll-mt-24 px-4 py-24 sm:px-6 sm:py-32", className)}>
      <div className="mx-auto max-w-6xl">
        {(eyebrow || title || intro) && (
          <Reveal className={cn("mb-12 max-w-3xl space-y-4 sm:mb-16", align === "center" && "mx-auto text-center")}>
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            {title && (
              <h2 id={titleId} className="text-4xl leading-[1.05] font-bold tracking-tight text-balance sm:text-5xl md:text-6xl">
                {title}
              </h2>
            )}
            {intro && <p className="text-lg text-pretty text-muted-foreground sm:text-xl">{intro}</p>}
          </Reveal>
        )}
        {children}
      </div>
    </section>
  )
}

/** Glaskort: halvgenomskinligt, suddig bakgrund, fin kant. */
export const GlassCard = React.forwardRef<HTMLDivElement, { children?: React.ReactNode; className?: string } & Omit<HTMLMotionProps<"div">, "children">>(
  function GlassCard({ children, className, ...rest }, ref) {
    return (
      <motion.div
        ref={ref}
        className={cn("relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset] backdrop-blur-md", className)}
        {...rest}
      >
        {children}
      </motion.div>
    )
  }
)

/**
 * Kort som lutar sig mot pekaren (3D) och får ett grönt sken där pekaren är.
 * Utan mus (touch) eller med "minska rörelse" står kortet still.
 */
export function TiltCard({ children, className, max = 8 }: { children: React.ReactNode; className?: string; max?: number }) {
  const reduce = useReducedMotion()
  const px = useMotionValue(0.5)
  const py = useMotionValue(0.5)
  const rx = useSpring(useTransform(py, [0, 1], [max, -max]), { stiffness: 200, damping: 20 })
  const ry = useSpring(useTransform(px, [0, 1], [-max, max]), { stiffness: 200, damping: 20 })
  const gx = useTransform(px, (v) => `${v * 100}%`)
  const gy = useTransform(py, (v) => `${v * 100}%`)
  const glow = useMotionTemplate`radial-gradient(420px circle at ${gx} ${gy}, color-mix(in oklch, var(--brand) 16%, transparent), transparent 60%)`
  return (
    <motion.div
      className={cn("group relative [perspective:1200px]", className)}
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== "mouse") return
        const r = e.currentTarget.getBoundingClientRect()
        px.set((e.clientX - r.left) / r.width)
        py.set((e.clientY - r.top) / r.height)
      }}
      onPointerLeave={() => {
        px.set(0.5)
        py.set(0.5)
      }}
    >
      <motion.div style={reduce ? undefined : { rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }} className="relative h-full">
        {children}
        <motion.div aria-hidden style={{ background: glow }} className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      </motion.div>
    </motion.div>
  )
}

/** Mjukt glödande färgfält i bakgrunden. */
export function GlowOrb({ className }: { className?: string }) {
  return <div aria-hidden className={cn("pointer-events-none absolute rounded-full bg-brand/20 blur-[120px]", className)} />
}

/** Diskret rutnät som tonar ut mot kanterna. */
export function GridBackdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]",
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
        "relative w-[280px] rounded-[2.75rem] border border-white/15 bg-[#05070a] p-2.5 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.04)_inset] sm:w-[300px]",
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
 * Liten bricka som svävar upp och ner (t.ex. "Nytt pass inbokat! ⚡").
 * `delay` förskjuter både intoningen och svävandet så att brickorna inte rör sig i takt.
 */
export function FloatingBadge({ children, className, delay = 0, distance = 10 }: { children: React.ReactNode; className?: string; delay?: number; distance?: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE, delay }}
      className={cn("absolute z-10", className)}
    >
      <motion.div
        animate={reduce ? undefined : { y: [0, -distance, 0] }}
        transition={{ duration: 5 + delay, repeat: Infinity, ease: "easeInOut", delay }}
        whileHover={{ scale: 1.05 }}
        className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#11161d]/80 px-3 py-2 text-sm font-medium shadow-xl shadow-black/40 backdrop-blur-md"
      >
        {children}
      </motion.div>
    </motion.div>
  )
}

/** Coaviras gröna toner för konfetti. */
const CONFETTI_COLORS = ["#aced37", "#6ee7b7", "#34d399", "#10b981", "#ffffff"]

/**
 * Konfetti från ett element (t.ex. knappen man tryckte på). Biblioteket
 * laddas först vid första tryck. Ingen konfetti med "minska rörelse".
 */
export function useConfetti() {
  const reduce = useReducedMotion()
  return React.useCallback(
    async (from?: Element | null, opts: { particles?: number; spread?: number } = {}) => {
      if (reduce) return
      const confetti = (await import("canvas-confetti")).default
      const r = from?.getBoundingClientRect()
      const origin = r ? { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight } : { x: 0.5, y: 0.6 }
      void confetti({
        particleCount: opts.particles ?? 90,
        spread: opts.spread ?? 70,
        startVelocity: 38,
        ticks: 180,
        scalar: 0.9,
        origin,
        colors: CONFETTI_COLORS,
        disableForReducedMotion: true,
      })
    },
    [reduce]
  )
}
