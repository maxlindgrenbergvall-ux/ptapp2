import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { LandingPreview } from "@/components/landing-preview/landing-preview"

/**
 * FÖRHANDSGRANSKNING – inte en del av den publicerade sajten.
 *
 * Ett förslag på en ny landningssida, byggt för att jämföras med dagens (/).
 * Sidan indexeras aldrig och svarar 404 i Vercels produktionsmiljö, så den
 * kan inte nås på coavira.fit även om koden skulle hamna där av misstag.
 * Granska lokalt: http://localhost:3000/landing-preview
 */
export const metadata: Metadata = {
  title: { absolute: "Coavira – förhandsgranskning av ny landningssida" },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
}

export default function LandingPreviewPage() {
  if (process.env.VERCEL_ENV === "production") notFound()
  return <LandingPreview />
}
