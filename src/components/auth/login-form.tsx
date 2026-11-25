"use client"

import { Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { AUTH_INPUT, AUTH_LABEL, AuthCard, authErrorMessage, FormError } from "@/components/auth/auth-card"
import { SocialButtons } from "@/components/auth/social-buttons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { prepareAppData } from "@/lib/data/handoff"
import { playLoginExit } from "@/lib/login-transition"
import { getSupabase } from "@/lib/supabase/client"
import { homeFor, isSupabaseEnabled, ONBOARDING_PATH, PT_LOGIN_PATH, roleFromClaims } from "@/lib/supabase/config"
import { START_PATH } from "@/lib/site"
import { forgetAccount, type KnownAccount } from "@/lib/known-account"
import { useKnownAccount } from "@/lib/use-known-account"

/**
 * Inloggningen. Med `known` (v80, enheten minns kontot) blir den "Välkommen
 * tillbaka, Sara" med e-posten ifylld och kontots inloggningssätt först.
 */
export function LoginForm({ start = false }: { start?: boolean } = {}) {
  const known = useKnownAccount()
  // Ny nyckel när kontot blir känt eller glöms: formuläret börjar om med rätt e-post.
  return <LoginFormInner key={known?.email ?? ""} known={isSupabaseEnabled ? known : null} start={start} />
}

function LoginFormInner({ known, start }: { known: KnownAccount | null; start: boolean }) {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = React.useState(known?.email ?? "")
  const [password, setPassword] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(
    params.get("fel") === "lank" ? "Länken var ogiltig eller har gått ut. Försök igen." : null
  )
  // E-posten bekräftades men länken öppnades i en annan webbläsare än registreringen.
  const confirmed = params.get("bekraftad") === "1"

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isSupabaseEnabled) {
      toast.info("Demoläge: ingen riktig inloggning", { description: "Välj vilken demovy du vill se i nästa steg." })
      router.push(ONBOARDING_PATH)
      return
    }
    setPending(true)
    setError(null)
    const { data, error: authError } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password })
    if (authError || !data.user) {
      setError(authErrorMessage(authError) ?? "Inloggningen misslyckades.")
      setPending(false)
      return
    }
    const role = roleFromClaims(data.user)
    const home = homeFor(role)
    const next = params.get("next")
    // v72: appens data hämtas nu (knappen visar att det pågår) och inloggningen tonas ut –
    // appen öppnas sedan direkt, utan laddningsskärm.
    if (role) await prepareAppData()
    await playLoginExit()
    // Hel sidladdning så att proxy.ts och servern ser den nya sessionscookien.
    // Konton utan vald kontotyp går till välkomststeget.
    window.location.href = role && next && next.startsWith(home) ? next : home
  }

  const social = known && known.method !== "password" ? known.method : null
  // Kom igång visar då den vanliga startsidan (KnownStart), Logga in det vanliga formuläret.
  const switchAccount = () => forgetAccount()

  return (
    <>
    <AuthCard
      title={known ? (known.name ? `Välkommen tillbaka, ${known.name}` : "Välkommen tillbaka") : "Logga in"}
      description={known ? known.email : "Välkommen tillbaka."}
      back={start ? undefined : START_PATH}
      footer={
        known ? (
          <>
            Inte du?{" "}
            <button type="button" onClick={switchAccount} className="font-medium text-foreground underline underline-offset-4" data-testid="switch-account">
              Byt konto
            </button>
            <span className="mx-2 text-muted-foreground/50">·</span>
            <Link href="/registrera" className="underline-offset-4 hover:underline">
              Skapa konto
            </Link>
          </>
        ) : (
          <>
            Inget konto?{" "}
            <Link href="/registrera" className="font-medium text-foreground underline underline-offset-4">
              Registrera dig
            </Link>
            <span className="mx-2 text-muted-foreground/50">·</span>
            <Link href={PT_LOGIN_PATH} className="underline-offset-4 hover:underline">
              PT-inloggning
            </Link>
          </>
        )
      }
    >
      {known && <span hidden data-testid="welcome-back" />}
      {/* Kontot loggade in med Apple/Google: den knappen först. E-postkonton: bara formuläret. */}
      {(!known || social) && (
        <>
      <SocialButtons next={params.get("next") ?? undefined} onError={setError} only={social ?? undefined} withDivider />
        </>
      )}
      <form onSubmit={submit} className="space-y-4">
        <FormError message={error} />
        {confirmed && !error && (
          <p role="status" className="rounded-xl bg-primary/10 px-3 py-2 text-sm text-primary">
            Din e-post är bekräftad. Logga in för att fortsätta.
          </p>
        )}
        {/* Känt konto: e-posten står i rubriken – fältet finns kvar (dolt) för lösenordshanterare. */}
        <div className={known ? "sr-only" : "space-y-1.5"}>
          <Label htmlFor="email" className={AUTH_LABEL}>
            E-post
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete={known ? "username" : "email"}
            required
            readOnly={Boolean(known)}
            tabIndex={known ? -1 : undefined}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={AUTH_INPUT}
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="password" className={AUTH_LABEL}>
              Lösenord
            </Label>
            <Link href="/glomt-losenord" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
              Glömt lösenordet?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            autoFocus={Boolean(known) && !social}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={AUTH_INPUT}
          />
        </div>
        <Button type="submit" size="lg" className="h-12 w-full rounded-xl text-base font-semibold" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {pending ? "Loggar in…" : "Logga in"}
        </Button>
      </form>
    </AuthCard>
    </>
  )
}
