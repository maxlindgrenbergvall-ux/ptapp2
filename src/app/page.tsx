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
import { landingJsonLd, SEO } from "@/lib/seo"
import { SITE_URL } from "@/lib/site"

export const metadata: Metadata = {
  title: { absolute: SEO.title },
  description: SEO.description,
  keywords: [...SEO.keywords],
  alternates: { canonical: SITE_URL },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  openGraph: {
    title: SEO.title,
    description: SEO.description,
    url: SITE_URL,
    siteName: BRAND.name,
    type: "website",
    locale: "sv_SE",
    images: [SEO.image],
  },
  twitter: { card: "summary_large_image", title: SEO.title, description: SEO.description, images: [SEO.image] },
  // Smart App Banner i Safari på iPhone när appen finns i App Store (NEXT_PUBLIC_APP_STORE_ID).
  ...(process.env.NEXT_PUBLIC_APP_STORE_ID ? { itunes: { appId: process.env.NEXT_PUBLIC_APP_STORE_ID } } : {}),
}

/**
 * Landningssidan på coavira.fit: Coavira är en mobilapp, så sidan leder till
 * App Store och Google Play – inga inloggnings- eller portallänkar. Appen och
 * webbportalen ligger på APP_URL (ptapp2.vercel.app).
 */
export default function LandingPage() {
  return (
    <LandingShell>
      {/* Strukturerad data: Coavira är en mobilapp för iOS och Android (< escapas mot XSS). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(landingJsonLd()).replace(/</g, "\\u003c") }} />
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
