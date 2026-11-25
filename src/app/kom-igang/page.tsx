import type { Metadata } from "next"
import Link from "next/link"

import { OrDivider, SocialButtons } from "@/components/auth/social-buttons"
import { StartSlideshow } from "@/components/auth/start-slideshow"
import { BrandMark } from "@/components/brand"
import { StartSplash } from "@/components/start-splash"
import { ReferralBanner } from "@/components/plus/referral-banner"
import { Button } from "@/components/ui/button"
import { BRAND } from "@/lib/brand"
import { PRIVACY_URL, TERMS_URL } from "@/lib/legal"
import { isSupabaseEnabled, PT_LOGIN_PATH, SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config"

export const metadata: Metadata = { title: "Kom igång" }

/**
 * Kom igång: inloggning och registrering för klienter (Apple, Google, e-post).
 * Landningssidan (/) och appen (iOS/Android) leder hit. PT:er skapar konto via /bli-pt (v76); tidigare skapades PT-konton av
 * Coavira och loggar in via PT-inloggningen. Inloggade skickas vidare av proxy.ts.
 */
export default function GetStarted() {
  return (
    <>
    {/* v71: i mobilappen – laddningsskärmen över inloggningen medan appen förladdas. */}
    <StartSplash />
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col overflow-x-clip px-5 pt-[calc(var(--safe-top)+1.25rem)] pb-[calc(var(--safe-bottom)+2rem)]">
      <section className="flex flex-1 flex-col justify-center gap-4">
        <div className="flex items-center gap-2.5">
          <Link href="/" aria-label={`${BRAND.name} – till startsidan`} className="block w-fit">
            <BrandMark size="md" />
          </Link>
          <h1 className="text-lg font-bold tracking-tight">{BRAND.name}</h1>
        </div>
        {/* v79: bildspel med animerade kort i stället för en lista. */}
        <StartSlideshow />

        <div className="space-y-4">
          <ReferralBanner />
          <SocialButtons />
          <OrDivider />
          <Button asChild size="lg" className="h-12 w-full text-base">
            <Link href="/registrera">Registrera dig</Link>
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Har du redan ett konto?{" "}
            <Link href="/logga-in" className="font-medium text-foreground underline underline-offset-4">
              Logga in
            </Link>
          </p>
          <p className="text-center text-xs text-muted-foreground">
            Är du PT?{" "}
            <Link href="/bli-pt" className="underline underline-offset-4">
              Bli PT på Coavira
            </Link>{" "}
            ·{" "}
            <Link href={PT_LOGIN_PATH} className="underline underline-offset-4">
              PT-inloggning
            </Link>
          </p>
        </div>

        {!isSupabaseEnabled && (
          <p className="rounded-lg bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
            Demoläge: inga riktiga konton skapas. Välj valfri metod för att prova flödet med påhittad data.
            <span className="mt-1 block">
              {/* Hjälp vid felsökning: vilka Supabase-uppgifter saknades när appen byggdes? */}
              Saknas vid bygget: {[!SUPABASE_URL && "Supabase-URL", !SUPABASE_KEY && "publik nyckel"].filter(Boolean).join(" och ")}.
            </span>
          </p>
        )}
      </section>
      <footer className="pt-6 text-center text-xs text-muted-foreground">
        <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
          Integritetspolicy
        </a>{" "}
        ·{" "}
        <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
          Användarvillkor
        </a>
      </footer>
    </main>
    </>
  )
}
