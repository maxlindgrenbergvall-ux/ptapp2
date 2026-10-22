"use client"

/**
 * Landningssidans meny: fast överst, genomskinlig högst upp och en glasbar
 * (suddig bakgrund, fin kant, lite lägre) när man scrollat. Markeringen
 * ("pillret") följer muspekaren/fokus och annars sektionen som syns i bild.
 * Mobil: menyknapp som fäller ut en tät panel (stängs med Esc och vid klick).
 * Prestanda på telefon: ingen backdrop-blur (tät bakgrund i stället) och ingen
 * fjädrande läsframstegslinje – den räknas bara om per scrollbild från md.
 */
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  type MotionValue,
  type Variants,
} from "framer-motion"
import { ArrowDown, ArrowUpRight, BadgeCheck } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { BrandMark } from "@/components/brand"
import { LINKS, NAV } from "@/components/landing/links"
import { StoreBadges } from "@/components/landing/store-badges"
import { EASE } from "@/components/landing/primitives"
import { BRAND } from "@/lib/brand"
import { cn } from "@/lib/utils"

const PANEL_ID = "landing-mobilmeny"
/** Samma brytpunkt som Tailwinds md (768 px). */
const WIDE_QUERY = "(min-width: 48rem)"
/** Så långt (px) man scrollar innan menyn blir en glasbar. */
const SCROLL_THRESHOLD = 24
const PILL_SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.8 } as const
const BAR_SPRING = { type: "spring", stiffness: 320, damping: 32 } as const
const MAGNET_SPRING = { stiffness: 260, damping: 18, mass: 0.4 }
const FOCUS_RING = "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"

const panelVariants: Variants = {
  hidden: { opacity: 0, y: -12, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: EASE, staggerChildren: 0.05, delayChildren: 0.05 } },
  exit: { opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.2, ease: EASE } },
}

const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
}

/**
 * Inglidning för menyns tre delar (logga, länkar, knappar) vid sidladdning. Bara rörelse,
 * ingen opacitet – annars vore länkar och knappar osynliga (men fokuserbara) fram till hydrering.
 */
const enter = (delay: number) => ({
  initial: { y: -10 },
  animate: { y: 0 },
  transition: { duration: 0.6, ease: EASE, delay },
})

/**
 * Mjuk scroll till en sektion (direkt hopp med "minska rörelse"). Adressen
 * uppdateras och fokus flyttas till sektionens rubrik för skärmläsare/tangentbord.
 */
function scrollToAnchor(e: React.MouseEvent<HTMLAnchorElement>, href: string, reduce: boolean) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  const target = document.getElementById(href.slice(1))
  if (!target) return
  e.preventDefault()
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })
  window.history.replaceState(window.history.state, "", href)
  const focusTarget = document.getElementById(`${target.id}-title`) ?? target
  if (!focusTarget.hasAttribute("tabindex")) focusTarget.setAttribute("tabindex", "-1")
  focusTarget.focus({ preventScroll: true })
}

function subscribeWide(onChange: () => void) {
  const mq = window.matchMedia(WIDE_QUERY)
  mq.addEventListener("change", onChange)
  return () => mq.removeEventListener("change", onChange)
}

/** Bred skärm (md+)? Falskt på servern och vid hydrering, så ingen glapp i markupen. */
function useIsWide() {
  return React.useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false
  )
}

/**
 * Läsframsteg: tunn grön linje längs menyns underkant. Monteras bara från md,
 * så att fjädern (useSpring) inte räknar om vid varje scrollbild på telefon.
 */
function ScrollProgress({ progress, visible, reduce }: { progress: MotionValue<number>; visible: boolean; reduce: boolean }) {
  const smooth = useSpring(progress, { stiffness: 160, damping: 30, restDelta: 0.001 })
  return (
    <motion.div
      aria-hidden
      initial={false}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      style={{ scaleX: reduce ? progress : smooth }}
      className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-px origin-left transform-gpu bg-gradient-to-r from-brand via-emerald-300 to-emerald-500 shadow-[0_0_12px_1px] shadow-brand/50 md:block"
    />
  )
}

/** Menysektionen (t.ex. "#priser") som ligger mitt i bild just nu, annars null. */
function useActiveSection() {
  const [active, setActive] = React.useState<string | null>(null)
  React.useEffect(() => {
    const ids = NAV.map((item) => item.href.slice(1))
    const els = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null)
    if (els.length === 0 || !("IntersectionObserver" in window)) return
    const visible = new Set<string>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        const id = ids.find((x) => visible.has(x))
        setActive(id ? `#${id}` : null)
      },
      { rootMargin: "-45% 0px -50% 0px" }
    )
    for (const el of els) io.observe(el)
    return () => io.disconnect()
  }, [])
  return active
}

/**
 * Glödande "Ladda ned appen" som dras en aning mot muspekaren (magnetisk) och
 * får ett ljussvep vid hovring. Scrollar till nedladdningssektionen med
 * App Store- och Google Play-brickorna. Glöden pulserar med ren CSS (opacitet
 * på GPU:n) och står still med "minska rörelse".
 */
function StartCta({
  label = "Ladda ned appen",
  onNavigate,
  className,
  linkClassName,
  arrowClassName,
}: {
  label?: string
  onNavigate?: () => void
  className?: string
  linkClassName?: string
  arrowClassName?: string
}) {
  const reduce = useReducedMotion()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const sx = useSpring(x, MAGNET_SPRING)
  const sy = useSpring(y, MAGNET_SPRING)
  return (
    <motion.div
      style={{ x: sx, y: sy }}
      whileTap={{ scale: 0.96 }}
      // whileTap ger annars omslaget tabindex="0" – ett tomt tabbstopp före länken. Bara länken ska nås med Tab.
      tabIndex={-1}
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== "mouse") return
        const r = e.currentTarget.getBoundingClientRect()
        x.set((e.clientX - (r.left + r.width / 2)) * 0.22)
        y.set((e.clientY - (r.top + r.height / 2)) * 0.3)
      }}
      onPointerLeave={() => {
        x.set(0)
        y.set(0)
      }}
      className={cn("group/cta relative", className)}
    >
      <span
        aria-hidden
        // animate-pulse: opacitet 1 → 0,5 → 1. Längre period för lugnare puls.
        style={{ animationDuration: "3.2s" }}
        className="pointer-events-none absolute -inset-1 transform-gpu animate-pulse rounded-full bg-brand/40 blur-lg motion-reduce:animate-none motion-reduce:opacity-60"
      />
      <a
        href={LINKS.download}
        onClick={(e) => {
          scrollToAnchor(e, LINKS.download, Boolean(reduce))
          onNavigate?.()
        }}
        className={cn(
          "relative inline-flex h-11 items-center justify-center gap-1.5 overflow-hidden rounded-full bg-brand px-5 text-sm font-semibold whitespace-nowrap text-brand-foreground shadow-[0_8px_30px_-6px] shadow-brand/50 transition-[filter] duration-300 hover:brightness-105",
          FOCUS_RING,
          linkClassName
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -translate-x-full -skew-x-12 bg-gradient-to-r from-transparent via-white/60 to-transparent transition-none group-hover/cta:translate-x-[400%] group-hover/cta:transition-transform group-hover/cta:duration-700 group-hover/cta:ease-out"
        />
        <span aria-hidden className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
        <span className="relative">{label}</span>
        <ArrowDown aria-hidden className={cn("relative size-4 transition-transform duration-300 group-hover/cta:translate-y-0.5", arrowClassName)} />
      </a>
    </motion.div>
  )
}

/** Hamburgare som blir ett kryss (två streck som roterar). */
function MenuIcon({ open }: { open: boolean }) {
  return (
    <span aria-hidden className="relative block h-3 w-[18px]">
      <motion.span
        className="absolute inset-x-0 top-0 h-0.5 rounded-full bg-current"
        initial={false}
        animate={open ? { y: 5, rotate: 45 } : { y: 0, rotate: 0 }}
        transition={BAR_SPRING}
      />
      <motion.span
        className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-current"
        initial={false}
        animate={open ? { y: -5, x: 0, rotate: -45, scaleX: 1 } : { y: 0, x: 3.6, rotate: 0, scaleX: 0.6 }}
        transition={BAR_SPRING}
      />
    </span>
  )
}

/** Fast toppmeny för landningssidan (dator: länkar i mitten, mobil: utfällbar panel). */
export function LandingNav() {
  const reduce = useReducedMotion()
  const { scrollY, scrollYProgress } = useScroll()
  const wide = useIsWide()
  const [scrolled, setScrolled] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const [hovered, setHovered] = React.useState<string | null>(null)
  const active = useActiveSection()
  const toggleRef = React.useRef<HTMLButtonElement>(null)
  const headerRef = React.useRef<HTMLElement>(null)
  const skipRef = React.useRef<HTMLAnchorElement>(null)

  // Bara vid passage av tröskeln – inte en uppdatering per scrollbild.
  useMotionValueEvent(scrollY, "change", (v) => {
    const next = v > SCROLL_THRESHOLD
    if (next !== scrolled) setScrolled(next)
  })

  // Öppen mobilmeny: Esc stänger (fokus tillbaka till knappen), och den stängs om fönstret blir brett.
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      setOpen(false)
      toggleRef.current?.focus()
    }
    const mq = window.matchMedia(WIDE_QUERY)
    const onWide = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    mq.addEventListener("change", onWide)
    return () => {
      document.removeEventListener("keydown", onKey)
      mq.removeEventListener("change", onWide)
    }
  }, [open])

  // Tangentbordsfokus får inte gömmas under den fasta menyn (WCAG 2.4.11): scrolla fram elementet en bit.
  // Hoppar över programmatiska mål (tabindex -1, t.ex. sektionsrubriker) så att ankarscroll inte störs.
  React.useEffect(() => {
    let raf = 0
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target
      const header = headerRef.current
      if (!(el instanceof HTMLElement) || !header || header.contains(el) || el === skipRef.current || el.tabIndex < 0) return
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        if (document.activeElement !== el || !el.matches(":focus-visible")) return
        const top = header.getBoundingClientRect().bottom + 8
        const r = el.getBoundingClientRect()
        if (r.top < top && r.bottom > 0 && r.height < window.innerHeight - top) window.scrollBy({ top: r.top - top, behavior: "auto" })
      })
    }
    document.addEventListener("focusin", onFocusIn)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener("focusin", onFocusIn)
    }
  }, [])

  const solid = scrolled || open
  const lit = hovered ?? active
  const close = () => setOpen(false)
  const onAnchor = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    scrollToAnchor(e, href, Boolean(reduce))
    setHovered(null)
    setOpen(false)
  }

  return (
    <>
      <a
        ref={skipRef}
        href="#innehall"
        className="fixed top-[calc(var(--safe-top)+0.75rem)] left-4 z-[60] -translate-y-[calc(100%+var(--safe-top)+2rem)] rounded-full bg-brand px-4 py-3 text-sm font-semibold text-brand-foreground shadow-lg shadow-black/40 transition-transform duration-200 focus:translate-y-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
      >
        Hoppa till innehållet
      </a>

      <header
        ref={headerRef}
        className="fixed inset-x-0 top-0 z-50 pt-[var(--safe-top)]"
        onBlur={(e) => {
          // Tabbar man vidare ut ur menyn till sidan stängs mobilpanelen.
          const next = e.relatedTarget
          if (open && next instanceof Node && !e.currentTarget.contains(next)) setOpen(false)
        }}
      >
        {/*
          Högst upp: mjuk toning för läsbarhet. Efter scroll: glasbar med kant – suddig bakgrund
          bara från md, på telefon en nästan tät bakgrund (läsbar utan blur). Lagren ligger på
          GPU:n (transform-gpu) eftersom de tonas vid scroll. Inte på <header>: en transform där
          skulle göra den fasta mobilbakgrunden (fixed inset-0) bara lika stor som menyn.
        */}
        <motion.div
          aria-hidden
          initial={false}
          animate={{ opacity: solid ? 0 : 1 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="pointer-events-none absolute inset-x-0 top-0 h-[calc(100%+1.5rem)] transform-gpu bg-gradient-to-b from-background/70 to-transparent"
        />
        <motion.div
          aria-hidden
          initial={false}
          animate={{ opacity: solid ? 1 : 0 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="pointer-events-none absolute inset-0 transform-gpu border-b border-white/10 bg-[#0a0d12]/90 shadow-[0_12px_40px_-24px_rgba(0,0,0,0.9)] md:bg-background/75 md:backdrop-blur-xl md:backdrop-saturate-150"
        >
          <span className="absolute inset-x-0 top-0 h-px bg-white/[0.03]" />
        </motion.div>
        {wide && <ScrollProgress progress={scrollYProgress} visible={scrolled} reduce={Boolean(reduce)} />}

        <div className="relative px-4 sm:px-6">
          <motion.div initial={false} animate={{ y: solid ? 0 : 8 }} transition={BAR_SPRING} className="mx-auto flex h-16 max-w-6xl items-center gap-3 will-change-transform">
            {/* Vänster: logga */}
            <motion.div {...enter(0.05)} className="flex flex-1 basis-0 items-center">
              <Link href="/" aria-label={`${BRAND.name} – startsidan`} className={cn("group/logo -m-1.5 flex items-center gap-2.5 rounded-xl p-1.5", FOCUS_RING)}>
                <span className="relative">
                  <span aria-hidden className="absolute inset-0 rounded-lg bg-brand opacity-0 blur-md transition-opacity duration-300 group-hover/logo:opacity-60" />
                  <BrandMark className="relative transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/logo:scale-105 group-hover/logo:-rotate-12" />
                </span>
                <span className="text-lg font-semibold tracking-tight">{BRAND.name}</span>
              </Link>
            </motion.div>

            {/* Mitten (md+): sektionslänkar med glidande markering */}
            <motion.nav {...enter(0.12)} aria-label="Huvudmeny" className="hidden md:block">
              <LayoutGroup id="landing-nav">
                <ul
                  className="flex items-center rounded-full border border-white/10 bg-white/[0.03] px-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                  onPointerLeave={(e) => {
                    // Bara riktig mus: på pekskärm (t.ex. iPad) skulle markeringen annars fastna på tryckt länk.
                    if (e.pointerType === "mouse") setHovered(null)
                  }}
                >
                  {NAV.map((item) => {
                    const isActive = active === item.href
                    const isLit = lit === item.href
                    return (
                      <li key={item.href} className="relative">
                        <a
                          href={item.href}
                          aria-current={isActive ? "location" : undefined}
                          onClick={(e) => onAnchor(e, item.href)}
                          onPointerEnter={(e) => {
                            if (e.pointerType === "mouse") setHovered(item.href)
                          }}
                          onFocus={() => setHovered(item.href)}
                          onBlur={() => setHovered(null)}
                          className={cn(
                            "relative flex h-11 items-center rounded-full px-3 text-sm font-medium whitespace-nowrap transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring lg:px-4",
                            isLit || isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {isLit && (
                            <motion.span
                              aria-hidden
                              layoutId="nav-pill"
                              transition={PILL_SPRING}
                              className="absolute inset-x-0 inset-y-1 rounded-full bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-white/10 ring-inset"
                            />
                          )}
                          <span className="relative">{item.label}</span>
                          {isActive && (
                            <motion.span
                              aria-hidden
                              layoutId="nav-dot"
                              transition={PILL_SPRING}
                              className="absolute inset-x-0 bottom-1.5 mx-auto size-1 rounded-full bg-brand shadow-[0_0_10px_2px] shadow-brand/60"
                            />
                          )}
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </LayoutGroup>
            </motion.nav>

            {/* Höger: Ladda ned appen och (mobil) menyknapp. Ingen inloggning – Coavira är en mobilapp. */}
            <motion.div {...enter(0.18)} className="flex flex-1 basis-0 items-center justify-end gap-2">
              <StartCta label="Ladda ned" arrowClassName="hidden sm:block" linkClassName="px-4 sm:px-5" />
              <button
                ref={toggleRef}
                type="button"
                aria-expanded={open}
                aria-controls={PANEL_ID}
                onClick={() => setOpen((v) => !v)}
                className={cn(
                  "inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-foreground transition-colors duration-200 hover:bg-white/[0.08] md:hidden",
                  FOCUS_RING
                )}
              >
                <span className="sr-only">Meny</span>
                <MenuIcon open={open} />
              </button>
            </motion.div>
          </motion.div>
        </div>

        {/* Mobilpanelen (finns alltid i DOM så att aria-controls pekar rätt) */}
        <div id={PANEL_ID} className="md:hidden">
          <AnimatePresence>
            {open && (
              <motion.div
                key="backdrop"
                aria-hidden
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
                onClick={close}
                // Panelen finns bara under md: tät toning i stället för backdrop-blur.
                className="fixed inset-0 -z-10 bg-background/80"
              />
            )}
            {open && (
              <motion.div key="panel" variants={panelVariants} initial="hidden" animate="show" exit="exit" className="absolute inset-x-0 top-full origin-top px-3 pt-2 sm:px-6">
                <div className="relative mx-auto max-h-[calc(100svh-var(--safe-top)-5rem)] max-w-6xl overflow-x-hidden overflow-y-auto overscroll-contain rounded-3xl border border-white/10 bg-[#0d1117] p-3 shadow-2xl shadow-black/60">
                  {/* Glöd som radiell gradient (billig) i stället för blur-3xl. */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -top-32 -right-24 size-72 bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brand)_18%,transparent),transparent)]"
                  />
                  <div aria-hidden className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-brand/50 to-transparent" />

                  <nav aria-label="Huvudmeny" className="relative">
                    <motion.ul variants={listVariants} className="space-y-1">
                      {NAV.map((item, i) => {
                        const isActive = active === item.href
                        return (
                          <motion.li key={item.href} variants={itemVariants}>
                            <a
                              href={item.href}
                              aria-current={isActive ? "location" : undefined}
                              onClick={(e) => onAnchor(e, item.href)}
                              className={cn(
                                "group/item flex min-h-14 items-center gap-4 rounded-2xl px-3 py-2 transition-colors duration-200 outline-none hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-ring",
                                isActive && "bg-white/[0.06]"
                              )}
                            >
                              <span aria-hidden className={cn("w-6 font-mono text-xs tabular-nums", isActive ? "text-brand" : "text-muted-foreground")}>{String(i + 1).padStart(2, "0")}</span>
                              <span className="min-w-0 flex-1 text-2xl font-semibold tracking-tight">{item.label}</span>
                              {isActive && <span aria-hidden className="size-1.5 rounded-full bg-brand shadow-[0_0_10px_2px] shadow-brand/60" />}
                              <ArrowUpRight
                                aria-hidden
                                className="size-5 shrink-0 text-muted-foreground transition-[translate,color] duration-300 group-hover/item:translate-x-0.5 group-hover/item:-translate-y-0.5 group-hover/item:text-brand"
                              />
                            </a>
                          </motion.li>
                        )
                      })}
                    </motion.ul>
                  </nav>

                  <motion.div variants={itemVariants} aria-hidden className="relative my-3 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

                  {/* Nedladdning: samma butiksbrickor som på resten av sidan. */}
                  <motion.div variants={itemVariants} className="relative">
                    <StoreBadges align="center" className="[&>*]:grow [&>*]:justify-center" />
                  </motion.div>

                  <motion.p variants={itemVariants} className="relative mt-3 text-center text-xs text-balance text-muted-foreground">
                    Gratis att ladda ned för iPhone och Android.
                  </motion.p>

                  <motion.div variants={itemVariants} className="relative mt-3 space-y-2">
                    {/* PT-konton skapas av Coavira efter manuell granskning av certifikat – ansökan sker via e-post. */}
                    <a
                      href={LINKS.ptApply}
                      onClick={close}
                      className={cn(
                        "group/apply flex min-h-14 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 transition-colors duration-200 hover:bg-white/[0.06]",
                        FOCUS_RING
                      )}
                    >
                      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
                        <BadgeCheck className="size-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">
                          Ansök som PT<span className="sr-only"> (öppnar e-post)</span>
                        </span>
                        <span className="block text-xs break-words text-muted-foreground">
                          Skicka ditt certifikat till {BRAND.certificationEmail} – vi granskar manuellt.
                        </span>
                      </span>
                      <ArrowUpRight
                        aria-hidden
                        className="size-4 shrink-0 text-brand transition-transform duration-300 group-hover/apply:translate-x-0.5 group-hover/apply:-translate-y-0.5"
                      />
                    </a>
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>
    </>
  )
}
