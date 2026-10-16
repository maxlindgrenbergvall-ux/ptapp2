"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import * as React from "react"

import { AuthCard, authErrorMessage, DemoNotice, FormError } from "@/components/auth/auth-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getSupabase } from "@/lib/supabase/client"
import { isSupabaseEnabled, PT_LOGIN_PATH } from "@/lib/supabase/config"

export default function ForgotPasswordPage() {
  return (
    <React.Suspense>
      <ForgotPassword />
    </React.Suspense>
  )
}

/**
 * Återställ lösenord. Med ?pt=1 är det också PT:ns första steg: kontot har
 * skapats av Coavira med bara e-post, och PT:n väljer sitt eget lösenord här.
 */
function ForgotPassword() {
  const pt = useSearchParams().get("pt") === "1"
  const [email, setEmail] = React.useState("")
  const [sent, setSent] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  if (!isSupabaseEnabled) return <DemoNotice />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPending(true)
    const { error: authError } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/nytt-losenord`,
    })
    setPending(false)
    // Samma besked oavsett om kontot finns, så att formuläret inte avslöjar vilka som är kunder.
    if (authError && /fetch|network|rate/i.test(authError.message)) setError(authErrorMessage(authError))
    else setSent(true)
  }

  return (
    <AuthCard
      title={pt ? "Välj ditt lösenord" : "Glömt lösenordet?"}
      description={
        sent
          ? "Om det finns ett konto för adressen har vi skickat en länk. Öppna den för att välja lösenord."
          : pt
            ? "Ange e-postadressen som Coavira registrerat ditt PT-konto med, så skickar vi en länk där du väljer ditt lösenord. Gäller både första inloggningen och om du glömt lösenordet."
            : "Ange din e-post så skickar vi en återställningslänk."
      }
      footer={
        <Link href={pt ? PT_LOGIN_PATH : "/logga-in"} className="underline underline-offset-4">
          Tillbaka till inloggningen
        </Link>
      }
    >
      {!sent && (
        <form onSubmit={submit} className="space-y-4">
          <FormError message={error} />
          <div className="space-y-2">
            <Label htmlFor="email">E-post</Label>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
          </div>
          <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>
            {pt ? "Skicka länk för att välja lösenord" : "Skicka länk"}
          </Button>
        </form>
      )}
    </AuthCard>
  )
}
