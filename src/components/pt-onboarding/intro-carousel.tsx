"use client"

/**
 * Steg 0 (v76, förfinat i v77): PT-introt före kontot – tre kort att svepa
 * eller klicka igenom, sedan "Skapa PT-konto". Varje kort har en liten animerad
 * bild (schemat fylls, betalningen går igenom, marginalen räknas upp), en rubrik
 * och en mening. Bilden spelas när kortet visas.
 */
import { AnimatePresence, motion, MotionConfig } from "framer-motion"
import { Check, FileText } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { BrandMark } from "@/components/brand"
import { CountUp, EASE } from "@/components/pt-onboarding/motion"
import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n/provider"
import { formatSek } from "@/lib/money"
import { PT_LOGIN_PATH } from "@/lib/supabase/config"
import { cn } from "@/lib/utils"

const SLIDES = [
  { title: "ptOnboarding.introSlide1Title", text: "ptOnboarding.introSlide1Text", Visual: ScheduleVisual },
  { title: "ptOnboarding.introSlide2Title", text: "ptOnboarding.introSlide2Text", Visual: PaymentVisual },
  { title: "ptOnboarding.introSlide3Title", text: "ptOnboarding.introSlide3Text", Visual: MarginVisual },
] as const

export function PtIntroCarousel() {
  const t = useT()
  const track = React.useRef<HTMLDivElement>(null)
  const [index, setIndex] = React.useState(0)

  // Svep (scroll-snap) uppdaterar punkterna; punkterna och tangenterna styr svepet.
  const onScroll = () => {
    const el = track.current
    if (!el) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    if (i !== index) setIndex(i)
  }
  const go = (i: number) => {
    const el = track.current
    if (!el) return
    const next = Math.max(0, Math.min(SLIDES.length - 1, i))
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    el.scrollTo({ left: next * el.clientWidth, behavior: reduce ? "auto" : "smooth" })
    setIndex(next)
  }

  return (
    <MotionConfig reducedMotion="user">
      <main className="relative mx-auto flex min-h-svh w-full max-w-lg flex-col overflow-hidden px-5 pt-[calc(var(--safe-top)+1.25rem)] pb-[calc(var(--safe-bottom)+1.25rem)]" data-testid="pt-intro">
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[60%]"
          animate={{ background: `radial-gradient(70% 60% at ${20 + index * 30}% 30%, rgba(132,204,22,0.18), transparent 70%)` }}
          transition={{ duration: 0.9, ease: EASE }}
        />
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} className="flex items-center gap-2.5">
          <BrandMark size="md" />
          <span className="text-sm font-semibold tracking-tight">{t("ptOnboarding.brandFor")}</span>
        </motion.div>

        <div
          ref={track}
          onScroll={onScroll}
          className="-mx-5 mt-4 flex flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="region"
          aria-roledescription="karusell"
          aria-label="Coavira för PT:er"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") go(index + 1)
            if (e.key === "ArrowLeft") go(index - 1)
          }}
        >
          {SLIDES.map((s, i) => {
            const active = i === index
            return (
              <section
                key={s.title}
                className="flex w-full shrink-0 snap-center flex-col justify-center gap-8 px-7"
                aria-roledescription="kort"
                aria-label={t("ptOnboarding.slide", { n: i + 1, total: SLIDES.length })}
                data-testid="pt-intro-slide"
              >
                <div className="flex h-56 items-center justify-center" aria-hidden>
                  <s.Visual active={active} />
                </div>
                <motion.div
                  className="space-y-3"
                  initial={false}
                  animate={active ? { opacity: 1, y: 0 } : { opacity: 0.35, y: 10 }}
                  transition={{ duration: 0.5, ease: EASE, delay: active ? 0.1 : 0 }}
                >
                  <h1 className="text-[2rem] leading-[1.1] font-bold tracking-tight text-balance">{t(s.title)}</h1>
                  <p className="text-[1.05rem] leading-relaxed text-pretty text-muted-foreground">{t(s.text)}</p>
                </motion.div>
              </section>
            )
          })}
        </div>

        <div className="flex justify-center gap-2 py-6" role="group" aria-label="Välj kort">
          {SLIDES.map((s, i) => (
            <button
              key={s.title}
              type="button"
              aria-label={t("ptOnboarding.slide", { n: i + 1, total: SLIDES.length })}
              aria-current={i === index || undefined}
              onClick={() => go(i)}
              className={cn(
                "h-1.5 rounded-full transition-[width,background-color] duration-500 ease-[var(--ease-out-soft)]",
                i === index ? "w-7 bg-[#84cc16]" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
              )}
              data-testid="pt-intro-dot"
            />
          ))}
        </div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE, delay: 0.2 }} className="space-y-3">
          <motion.div whileTap={{ scale: 0.98 }}>
            <Button asChild size="lg" className="h-13 w-full rounded-2xl text-base font-semibold shadow-[0_8px_30px_-8px_rgba(132,204,22,0.55)]" data-testid="pt-intro-create">
              <Link href="/bli-pt/konto">{t("ptOnboarding.createAccount")}</Link>
            </Button>
          </motion.div>
          <p className="text-center text-sm text-muted-foreground">
            {t("ptOnboarding.haveAccount")}{" "}
            <Link href={PT_LOGIN_PATH} className="font-medium text-foreground underline underline-offset-4">
              {t("ptOnboarding.logIn")}
            </Link>
          </p>
        </motion.div>
      </main>
    </MotionConfig>
  )
}

// ------------------------------------------------------------ bilderna ---
const card = "relative w-full max-w-[17rem] rounded-3xl border border-white/8 bg-card/80 p-4 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] backdrop-blur"

/** Kort 1: en arbetsvecka där bokningarna fylls på en efter en. */
function ScheduleVisual({ active }: { active: boolean }) {
  const t = useT()
  const booked = [1, 3, 5, 6, 8, 11, 12, 14]
  return (
    <div className={card}>
      <div className="mb-3 flex items-center justify-between">
        <span className="h-2 w-16 rounded-full bg-muted" />
        <span className="h-2 w-8 rounded-full bg-muted" />
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: 15 }, (_, i) => {
          const on = booked.includes(i)
          return (
            <motion.span
              key={i}
              className="h-7 rounded-lg"
              initial={false}
              animate={{
                backgroundColor: active && on ? "rgba(132,204,22,0.9)" : "rgba(127,127,127,0.14)",
                scale: active && on ? [0.8, 1.06, 1] : 1,
              }}
              transition={{ delay: active && on ? 0.15 + booked.indexOf(i) * 0.09 : 0, duration: 0.4, ease: EASE }}
            />
          )
        })}
      </div>
      <AnimatePresence>
        {active && (
          <motion.span
            key="badge"
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.95, type: "spring", stiffness: 320, damping: 22 }}
            className="absolute -right-4 -bottom-4 flex items-center gap-1.5 rounded-full bg-[#84cc16] px-3 py-1.5 text-xs font-semibold text-[#131916] shadow-lg"
          >
            <Check className="size-3.5" strokeWidth={3} /> {t("ptOnboarding.illoBooked")}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Kort 2: en betalning som går igenom och blir ett friskvårdskvitto. */
function PaymentVisual({ active }: { active: boolean }) {
  const t = useT()
  return (
    <div className="relative w-full max-w-[17rem]">
      <div className={card}>
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-foreground px-2.5 py-1 text-[0.7rem] font-semibold text-background">Apple Pay</span>
          <span className="h-2 w-10 rounded-full bg-muted" />
        </div>
        <p className="mt-5 text-3xl font-bold tracking-tight">
          <CountUp value={active ? 3845 : 0} format={formatSek} />
        </p>
        <div className="mt-4 flex items-center gap-2">
          <motion.span
            className="flex size-6 items-center justify-center rounded-full bg-[#84cc16] text-[#131916]"
            initial={false}
            animate={active ? { scale: 1, opacity: 1 } : { scale: 0.4, opacity: 0 }}
            transition={{ delay: active ? 0.7 : 0, type: "spring", stiffness: 400, damping: 18 }}
          >
            <Check className="size-3.5" strokeWidth={3} />
          </motion.span>
          <motion.span className="text-sm font-medium" initial={false} animate={{ opacity: active ? 1 : 0 }} transition={{ delay: active ? 0.8 : 0 }}>
            {t("ptOnboarding.illoPaid")}
          </motion.span>
        </div>
      </div>
      <motion.div
        className="absolute -right-3 -bottom-8 flex items-center gap-2 rounded-2xl border border-white/8 bg-card px-3 py-2.5 shadow-xl"
        initial={false}
        animate={active ? { opacity: 1, y: 0, rotate: -3 } : { opacity: 0, y: 18, rotate: 0 }}
        transition={{ delay: active ? 1.0 : 0, duration: 0.5, ease: EASE }}
      >
        <span className="flex size-7 items-center justify-center rounded-lg bg-[#84cc16]/15 text-[#84cc16]">
          <FileText className="size-4" />
        </span>
        <span className="text-xs font-semibold">{t("ptOnboarding.illoReceipt")}</span>
      </motion.div>
    </div>
  )
}

/** Kort 3: en ring som fylls medan PT:ns netto räknas upp. */
function MarginVisual({ active }: { active: boolean }) {
  const t = useT()
  const r = 64
  return (
    <div className="relative flex size-48 items-center justify-center">
      <svg viewBox="0 0 160 160" className="absolute inset-0 -rotate-90">
        <circle cx="80" cy="80" r={r} fill="none" stroke="currentColor" strokeWidth="12" className="text-muted/60" />
        <motion.circle
          cx="80"
          cy="80"
          r={r}
          fill="none"
          stroke="#84cc16"
          strokeWidth="12"
          strokeLinecap="round"
          initial={false}
          animate={{ pathLength: active ? 0.9 : 0 }}
          transition={{ duration: active ? 1.2 : 0.3, ease: EASE, delay: active ? 0.15 : 0 }}
        />
      </svg>
      <div className="text-center">
        <p className="text-xs font-medium text-muted-foreground">{t("ptOnboarding.illoMargin")}</p>
        <p className="text-2xl font-bold tracking-tight">
          <CountUp value={active ? 3495 : 0} format={formatSek} />
        </p>
      </div>
    </div>
  )
}
