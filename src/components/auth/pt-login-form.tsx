"use client"

import { Loader2 } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import * as React from "react"

import { AUTH_INPUT, AUTH_LABEL, AuthCard, authErrorMessage, FormError } from "@/components/auth/auth-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { prepareAppData } from "@/lib/data/handoff"
import { playLoginExit } from "@/lib/login-transition"
import { getSupabase } from "@/lib/supabase/client"
import { HOME_FOR_ROLE, isSupabaseEnabled, roleFromClaims } from "@/lib/supabase/config"
import { START_PATH } from "@/lib/site"

/**
 * Inloggning för PT:er. PT-konton skapas i förväg av Coavira med bara
 * e-postadressen (ingen självregistrering), och PT:n väljer sitt eget lösenord
 * via "Glömt lösenordet?" före första inloggningen. Här finns bara e-post och
 * lösenord – PT-konton kan inte använda Apple/Google. Ett konto som inte är
 * PT-konto loggas ut direkt med en förklaring.
 */
export function PtLoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(
    params.get("fel") === "social" ? "PT-konton kan bara logga in med e-post och lösenord, inte med Apple eller Google." : null
  )

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!isSupabaseEnabled) {
      // Demoläge: PT-demon.
      router.push(HOME_FOR_ROLE.trainer)
      return
    }
    setPending(true)
    const sb = getSupabase()
    const { data, error: authError } = await sb.auth.signInWithPassword({ email: email.trim(), password })
    if (authError || !data.user) {
      setPending(false)
      return setError(authErrorMessage(authError) ?? "Inloggningen misslyckades.")
    }
    if (roleFromClaims(data.user) !== "trainer") {
      await sb.auth.signOut()
      setPending(false)
      return setError("Kontot är inte ett PT-konto. Klienter loggar in på den vanliga inloggningssidan.")
    }
    // v72: appens data hämtas nu (knappen visar att det pågår) och inloggningen tonas ut –
    // appen öppnas sedan direkt, utan laddningsskärm.
    await prepareAppData()
    await playLoginExit()
    // Hel sidladdning så att proxy.ts och servern ser den nya sessionscookien.
    window.location.href = HOME_FOR_ROLE.trainer
  }

  return (
    <>
    <AuthCard
      title="PT-inloggning"
      description="Logga in med din e-post och ditt lösenord."
      back="/bli-pt"
      footer={
        <>
          Ny som PT?{" "}
          <Link href="/bli-pt" className="font-medium text-foreground underline underline-offset-4" data-testid="pt-create-account-link">
            Skapa PT-konto
          </Link>
          <span className="mx-2 text-muted-foreground/50">·</span>
          <Link href={START_PATH} className="underline-offset-4 hover:underline">
            Klientinloggning
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <FormError message={error} />
        {!isSupabaseEnabled && <p className="rounded-xl bg-muted/50 px-4 py-3 text-xs text-muted-foreground">Demoläge: du loggas in som en demo-PT med påhittad data.</p>}
        <div className="space-y-1.5">
          <Label htmlFor="email" className={AUTH_LABEL}>
            E-post
          </Label>
          <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={AUTH_INPUT} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="password" className={AUTH_LABEL}>
              Lösenord
            </Label>
            <Link href="/glomt-losenord?pt=1" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
              Glömt lösenordet?
            </Link>
          </div>
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={AUTH_INPUT} />
        </div>
        <Button type="submit" size="lg" className="h-12 w-full rounded-xl text-base font-semibold" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {pending ? "Loggar in…" : "Logga in"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Har Coavira skapat ditt konto?{" "}
          <Link href="/glomt-losenord?pt=1" className="underline underline-offset-4">
            Välj lösenord
          </Link>
        </p>
      </form>
    </AuthCard>
    </>
  )
}
