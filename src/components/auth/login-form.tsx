"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { AuthCard, authErrorMessage, FormError } from "@/components/auth/auth-card"
import { OrDivider, SocialButtons } from "@/components/auth/social-buttons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getSupabase } from "@/lib/supabase/client"
import { homeFor, isSupabaseEnabled, ONBOARDING_PATH, PT_LOGIN_PATH, roleFromClaims } from "@/lib/supabase/config"

export function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(
    params.get("fel") === "lank" ? "Länken var ogiltig eller har gått ut. Försök igen." : null
  )

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
    // Hel sidladdning så att proxy.ts och servern ser den nya sessionscookien.
    // Konton utan vald kontotyp går till välkomststeget.
    window.location.href = role && next && next.startsWith(home) ? next : home
  }

  return (
    <AuthCard
      title="Logga in"
      description="Välkommen tillbaka."
      footer={
        <>
          Inget konto?{" "}
          <Link href="/registrera" className="font-medium text-foreground underline underline-offset-4">
            Registrera dig
          </Link>
          <span className="mt-3 block text-xs">
            Är du PT?{" "}
            <Link href={PT_LOGIN_PATH} className="underline underline-offset-4">
              Logga in med kontot du fått av Coavira
            </Link>
          </span>
        </>
      }
    >
      <SocialButtons next={params.get("next") ?? undefined} onError={setError} />
      <OrDivider />
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
