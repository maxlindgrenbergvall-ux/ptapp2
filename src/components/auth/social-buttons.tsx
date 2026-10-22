"use client"

import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { authErrorMessage } from "@/components/auth/auth-card"
import { Button } from "@/components/ui/button"
import { authCallbackUrl } from "@/lib/auth-redirect"
import { isNativeApp, nativeAuthCallbackUrl } from "@/lib/native/app"
import { isSupabaseEnabled, ONBOARDING_PATH } from "@/lib/supabase/config"
import { cn } from "@/lib/utils"

export type SocialProvider = "apple" | "google"

/**
 * "Fortsätt med Apple/Google" via Supabase Auth (OAuth med PKCE).
 *
 * Supabase skickar tillbaka användaren till /auth/callback, som byter koden mot
 * en session. Därefter: nya konton → välkomststeget (välj kontotyp), befintliga
 * → sin startsida (proxy.ts styr det). Samma knapp fungerar för både inloggning
 * och registrering.
 *
 * I Coavira-appen öppnas leverantören i systemets webbläsare (Google tillåter
 * inte inloggning i en WebView) och kommer tillbaka via com.coavira.app://
 * (se NativeBridge). PKCE-nyckeln ligger kvar i appens WebView, så koden byts
 * mot en session där.
 */
export function SocialButtons({ next, onError }: { next?: string; onError?: (message: string) => void }) {
  const router = useRouter()
  const [pending, setPending] = React.useState<SocialProvider | null>(null)

  const start = async (provider: SocialProvider) => {
    if (!isSupabaseEnabled) {
      toast.info("Demoläge: inget riktigt konto skapas", { description: "Välj kontotyp i nästa steg för att prova appen." })
      router.push(ONBOARDING_PATH)
      return
    }
    setPending(provider)
    const target = next && next.startsWith("/") && !next.startsWith("//") ? next : ONBOARDING_PATH
    const native = isNativeApp()
    // Supabase-klienten laddas först vid klick, så att sidor med knapparna (t.ex.
    // landningssidan) inte behöver ladda hela klienten i förväg.
    const { getSupabase } = await import("@/lib/supabase/client")
    const { data, error } = await getSupabase().auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: native ? nativeAuthCallbackUrl(target) : authCallbackUrl(target),
        skipBrowserRedirect: native,
        // Google: visa kontoväljaren även om man bara har ett konto inloggat.
        ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}),
      },
    })
    if (native && !error && data.url) {
      const { Browser } = await import("@capacitor/browser")
      await Browser.open({ url: data.url, presentationStyle: "popover" })
      // Om användaren stänger fönstret utan att logga in.
      const sub = await Browser.addListener("browserFinished", () => {
        setPending(null)
        void sub.remove()
      })
      return
    }
    // Vid lyckat anrop har webbläsaren redan börjat navigera till leverantören.
    if (error) {
      setPending(null)
      const message = authErrorMessage(error) ?? "Inloggningen kunde inte startas."
      if (onError) onError(message)
      else toast.error(message)
    }
  }

  return (
    <div className="grid gap-2.5">
      <Button
        type="button"
        size="lg"
        disabled={pending !== null}
        onClick={() => void start("apple")}
        // Apples riktlinjer: svart knapp i ljust läge, vit i mörkt.
        className="h-12 bg-black text-base text-white hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/85"
      >
        {pending === "apple" ? <Loader2 className="animate-spin" /> : <AppleLogo />}
        Fortsätt med Apple
      </Button>
      <Button
        type="button"
        size="lg"
        variant="outline"
        disabled={pending !== null}
        onClick={() => void start("google")}
        className="h-12 bg-background text-base"
      >
        {pending === "google" ? <Loader2 className="animate-spin" /> : <GoogleLogo />}
        Fortsätt med Google
      </Button>
    </div>
  )
}

/** Avdelare "eller" mellan sociala knappar och formulär. */
export function OrDivider({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 text-xs text-muted-foreground", className)} role="separator">
      <span className="h-px flex-1 bg-border" />
      eller
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-5 fill-current">
      <path d="M16.37 1.43c0 1.14-.49 2.27-1.18 3.08-.74.9-1.99 1.57-2.99 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.57-2.27 1.21-2.98.8-.94 2.14-1.64 3.25-1.68.03.13.05.28.05.43zm4.56 15.71c-.03.07-.46 1.58-1.52 3.12-.94 1.34-1.94 2.71-3.43 2.71-1.52 0-1.9-.88-3.63-.88-1.7 0-2.3.91-3.67.91-1.38 0-2.33-1.26-3.43-2.8-1.29-1.82-2.32-4.63-2.32-7.28 0-4.28 2.8-6.55 5.55-6.55 1.45 0 2.67.95 3.6.95.86 0 2.22-1.01 3.9-1.01.61 0 2.89.06 4.37 2.19-.13.09-2.38 1.37-2.38 4.19 0 3.26 2.85 4.42 2.96 4.45z" />
    </svg>
  )
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className="size-5">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </svg>
  )
}
