import type { Metadata } from "next"

import { FeatureBento } from "@/components/landing/bento"
import { ChatShowcase } from "@/components/landing/chat-showcase"
import { FinalCta, LandingFooter } from "@/components/landing/final-cta"
import { GoalShowcase } from "@/components/landing/goals"
import { Hero } from "@/components/landing/hero"
import { LandingShell } from "@/components/landing/landing-shell"
import { LandingNav } from "@/components/landing/nav"
import { Pricing } from "@/components/landing/pricing"
import { BRAND } from "@/lib/brand"

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name} – Framtidens träning & kost i en plattform` },
  description:
    "Sömlös coachning för PT:er och maximal effekt för klienter: träningspass, kostschema, kalender, chatt och videosamtal på ett ställe – med säker kortbetalning och verifierade PT:er.",
  alternates: { canonical: "/" },
  openGraph: { url: "/", type: "website" },
}

/**
 * Landningssidan (publik). Inloggade skickas till sin startsida av proxy.ts,
 * och appen (iOS/Android) börjar på /kom-igang.
 */
export default function LandingPage() {
  return (
    <LandingShell>
      <LandingNav />
      <main id="innehall">
        <Hero />
        <FeatureBento />
        <GoalShowcase />
        <ChatShowcase />
        <Pricing />
        <FinalCta />
      </main>
      <LandingFooter />
    </LandingShell>
  )
}
