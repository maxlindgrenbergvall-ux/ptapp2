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
import { SITE_URL } from "@/lib/site"

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name} – Appen för träning & kost med din PT` },
  description:
    "Ladda ned Coavira för iPhone och Android. Sömlös coachning för PT:er och maximal effekt för klienter: träningspass, kostschema, kalender, chatt och videosamtal i en app – med säker kortbetalning och verifierade PT:er.",
  alternates: { canonical: SITE_URL },
  openGraph: { url: SITE_URL, type: "website", siteName: BRAND.name, locale: "sv_SE" },
  twitter: { card: "summary_large_image" },
  // Smart App Banner i Safari på iPhone när appen finns i App Store (NEXT_PUBLIC_APP_STORE_ID).
  ...(process.env.NEXT_PUBLIC_APP_STORE_ID ? { itunes: { appId: process.env.NEXT_PUBLIC_APP_STORE_ID } } : {}),
}

/**
 * Landningssidan på coavira.fit: Coavira är en mobilapp, så sidan leder till
 * App Store och Google Play – inga inloggnings- eller portallänkar. (Appen
 * själv laddar sina sidor från samma domän och börjar på /kom-igang.)
 */
export default function LandingPage() {
  return (
    <LandingShell>
      <LandingNav />
      <main id="innehall" tabIndex={-1} className="outline-none">
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
