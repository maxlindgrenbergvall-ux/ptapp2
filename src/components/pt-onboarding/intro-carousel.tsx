"use client"

/**
 * Steg 0 (v76, förfinat i v77, bildspel i v79): PT-introt före kontot – tre kort
 * som byter själva (Slideshow), sedan "Skapa PT-konto". Varje kort har en liten
 * animerad bild (schemat fylls, betalningen går igenom, marginalen räknas upp),
 * en rubrik och en mening.
 */
import { motion, MotionConfig } from "framer-motion"
import Link from "next/link"
import * as React from "react"

import { BrandMark } from "@/components/brand"
import { EASE } from "@/components/flow/motion"
import { Slideshow, type Slide } from "@/components/flow/slideshow"
import { MarginVisual, PaymentVisual, ScheduleVisual } from "@/components/flow/visuals"
import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n/provider"
import { PT_LOGIN_PATH } from "@/lib/supabase/config"

export function PtIntroCarousel() {
  const t = useT()
  const [index, setIndex] = React.useState(0)
  const slides: Slide[] = [
    { id: "schedule", title: t("ptOnboarding.introSlide1Title"), text: t("ptOnboarding.introSlide1Text"), visual: (a) => <ScheduleVisual active={a} badge={t("ptOnboarding.illoBooked")} /> },
    {
      id: "payments",
      title: t("ptOnboarding.introSlide2Title"),
      text: t("ptOnboarding.introSlide2Text"),
      visual: (a) => <PaymentVisual active={a} paid={t("ptOnboarding.illoPaid")} receipt={t("ptOnboarding.illoReceipt")} />,
    },
    { id: "margin", title: t("ptOnboarding.introSlide3Title"), text: t("ptOnboarding.introSlide3Text"), visual: (a) => <MarginVisual active={a} label={t("ptOnboarding.illoMargin")} /> },
  ]

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

        <Slideshow
          className="mt-4 flex-1"
          slides={slides}
          ariaLabel="Coavira för PT:er"
          slideLabel={(n, total) => t("ptOnboarding.slide", { n, total })}
          onIndexChange={setIndex}
        />

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
