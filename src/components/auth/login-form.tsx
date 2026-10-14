"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import * as React from "react"

import { AuthCard, authErrorMessage, FormError } from "@/components/auth/auth-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getSupabase } from "@/lib/supabase/client"
import { HOME_FOR_ROLE, isSupabaseEnabled, roleFromMetadata } from "@/lib/supabase/config"

export function LoginForm() {
  const params = useSearchParams()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(
    params.get("fel") === "lank" ? "Länken var ogiltig eller har gått ut. Försök igen." : null
  )

  if (!isSupabaseEnabled) return <DemoNotice />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPending(true)
    setError(null)
    const { data, error: authError } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password })
    if (authError || !data.user) {
      setError(authErrorMessage(authError) ?? "Inloggningen misslyckades.")
      setPending(false)
      return
    }
    const home = HOME_FOR_ROLE[roleFromMetadata(data.user.user_metadata)]
    const next = params.get("next")
    // Hel sidladdning så att proxy.ts och servern ser den nya sessionscookien.
    window.location.href = next && next.startsWith(home) ? next : home
  }

  return (
    <AuthCard
      title="Logga in"
      description="Välkommen tillbaka."
      footer={
        <>
          Inget konto?{" "}
          <Link href="/registrera" className="font-medium text-foreground underline underline-offset-4">
            Skapa ett
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <FormError message={error} />
        <div className="space-y-2">
          <Label htmlFor="email">E-post</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
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
      </form>
    </AuthCard>
  )
}

export function DemoNotice() {
  return (
    <AuthCard
      title="Demoläge"
      description="Supabase är inte konfigurerat, så inloggning är avstängd. Sätt NEXT_PUBLIC_SUPABASE_URL och NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (se .env.example)."
    >
      <Button asChild size="lg" className="h-11 w-full">
        <Link href="/">Till demovyerna</Link>
      </Button>
    </AuthCard>
  )
}
