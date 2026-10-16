"use client"

import Link from "next/link"
import * as React from "react"

import { AuthCard, authErrorMessage, DemoNotice, FormError } from "@/components/auth/auth-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getSupabase } from "@/lib/supabase/client"
import { isSupabaseEnabled } from "@/lib/supabase/config"

export default function ForgotPasswordPage() {
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
      title="Glömt lösenordet?"
      description={sent ? "Om det finns ett konto för adressen har vi skickat en länk för att välja nytt lösenord." : "Ange din e-post så skickar vi en återställningslänk."}
      footer={<Link href="/logga-in" className="underline underline-offset-4">Tillbaka till inloggningen</Link>}
    >
      {!sent && (
        <form onSubmit={submit} className="space-y-4">
          <FormError message={error} />
          <div className="space-y-2">
            <Label htmlFor="email">E-post</Label>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
          </div>
          <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>
            Skicka länk
          </Button>
        </form>
      )}
    </AuthCard>
  )
}
