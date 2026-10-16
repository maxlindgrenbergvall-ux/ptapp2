"use client"

import { ShieldCheck } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"

import { AuthCard, authErrorMessage, FormError } from "@/components/auth/auth-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getSupabase } from "@/lib/supabase/client"
import { HOME_FOR_ROLE, isSupabaseEnabled, roleFromClaims } from "@/lib/supabase/config"

/**
 * Inloggning för PT:er. PT-konton skapas i förväg av Coavira (ingen
 * självregistrering), så här finns bara e-post och lösenord – inga
 * registrerings- eller Apple/Google-knappar. Ett konto som inte är PT-konto
 * loggas ut direkt med en förklaring.
 */
export function PtLoginForm() {
  const router = useRouter()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!isSupabaseEnabled) {
      // Demoläge: PT-demon (Elin).
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
    // Hel sidladdning så att proxy.ts och servern ser den nya sessionscookien.
    window.location.href = HOME_FOR_ROLE.trainer
  }

  return (
    <AuthCard
      title="PT-inloggning"
      description="Logga in med e-post och lösenord från Coavira."
      footer={
        <>
          Tränar du?{" "}
          <Link href="/" className="font-medium text-foreground underline underline-offset-4">
            Till klientinloggningen
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <FormError message={error} />
        <div className="space-y-2">
          <Label htmlFor="email">E-post</Label>
          <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="password">Lösenord</Label>
            <Link href="/glomt-losenord" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
              Glömt lösenordet?
            </Link>
          </div>
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
        </div>
        <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>
          {pending ? "Loggar in…" : "Logga in"}
        </Button>
        <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          {isSupabaseEnabled
            ? "PT-konton skapas av Coavira efter granskning. Vill du bli PT på Coavira? Kontakta oss så får du dina inloggningsuppgifter."
            : "Demoläge: du loggas in som PT:n Elin med påhittad data."}
        </p>
      </form>
    </AuthCard>
  )
}
