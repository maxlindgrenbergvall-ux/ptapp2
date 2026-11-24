"use client"

/**
 * Steg 0 (v76): PT-introt före kontot – tre korta kort att svepa eller klicka
 * igenom, sedan "Skapa PT-konto". Ingen textvägg: en rubrik och en mening per kort.
 */
import { CalendarCheck, CreditCard, Gauge } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { BrandMark } from "@/components/brand"
import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n/provider"
import { PT_LOGIN_PATH } from "@/lib/supabase/config"
import { cn } from "@/lib/utils"

const SLIDES = [
  { icon: CalendarCheck, title: "ptOnboarding.introSlide1Title", text: "ptOnboarding.introSlide1Text" },
  { icon: CreditCard, title: "ptOnboarding.introSlide2Title", text: "ptOnboarding.introSlide2Text" },
  { icon: Gauge, title: "ptOnboarding.introSlide3Title", text: "ptOnboarding.introSlide3Text" },
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
    <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col px-4 pt-[calc(var(--safe-top)+1.5rem)] pb-[calc(var(--safe-bottom)+1.5rem)]" data-testid="pt-intro">
      <BrandMark size="md" />
      <div
        ref={track}
        onScroll={onScroll}
        className="-mx-4 mt-6 flex flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="region"
        aria-roledescription="karusell"
        aria-label="Coavira för PT:er"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(index + 1)
          if (e.key === "ArrowLeft") go(index - 1)
        }}
      >
        {SLIDES.map((s, i) => (
          <section
            key={s.title}
            className="flex w-full shrink-0 snap-center flex-col justify-center gap-5 px-6"
            aria-roledescription="kort"
            aria-label={t("ptOnboarding.slide", { n: i + 1, total: SLIDES.length })}
            data-testid="pt-intro-slide"
          >
            <span className="flex size-16 items-center justify-center rounded-2xl bg-[#84cc16]/15 text-[#84cc16]">
              <s.icon className="size-8" aria-hidden />
            </span>
            <h1 className="text-3xl font-bold tracking-tight text-balance">{t(s.title)}</h1>
            <p className="text-lg text-pretty text-muted-foreground">{t(s.text)}</p>
          </section>
        ))}
      </div>

      <div className="flex justify-center gap-2 py-6" role="group" aria-label="Välj kort">
        {SLIDES.map((s, i) => (
          <button
            key={s.title}
            type="button"
            aria-label={t("ptOnboarding.slide", { n: i + 1, total: SLIDES.length })}
            aria-current={i === index || undefined}
            onClick={() => go(i)}
            className={cn("h-2 rounded-full transition-[width,background-color] duration-300", i === index ? "w-6 bg-[#84cc16]" : "w-2 bg-muted-foreground/30")}
            data-testid="pt-intro-dot"
          />
        ))}
      </div>

      <div className="space-y-2">
        <Button asChild size="lg" className="h-12 w-full text-base" data-testid="pt-intro-create">
          <Link href="/bli-pt/konto">{t("ptOnboarding.createAccount")}</Link>
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          {t("ptOnboarding.haveAccount")}{" "}
          <Link href={PT_LOGIN_PATH} className="font-medium text-foreground underline underline-offset-4">
            {t("ptOnboarding.logIn")}
          </Link>
        </p>
      </div>
    </main>
  )
}
