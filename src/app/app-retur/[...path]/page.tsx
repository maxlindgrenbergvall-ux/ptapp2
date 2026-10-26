import type { Metadata } from "next"

import { AppReturn } from "@/components/native/app-return"

export const metadata: Metadata = { title: "Tillbaka till Coavira", robots: { index: false, follow: false } }

/**
 * Stripes success_url/cancel_url när betalningen gjordes i appen (src/lib/app-return.ts).
 * Sidan visas i appens webbläsarvy och lämnar över till appen. Ingen inloggning behövs
 * (webbläsarvyn har inga av appens cookies) – sidan läser och visar inget om köpet.
 */
export default function AppReturnPage() {
  return <AppReturn />
}
