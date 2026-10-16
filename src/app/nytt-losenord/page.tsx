"use client"

import * as React from "react"

import { AuthCard, authErrorMessage, DemoNotice, FormError } from "@/components/auth/auth-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getSupabase } from "@/lib/supabase/client"
import { homeFor, isSupabaseEnabled, roleFromClaims } from "@/lib/supabase/config"

export default function NewPasswordPage() {
  const [password, setPassword] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  if (!isSupabaseEnabled) return <DemoNotice />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) return setError("Lösenordet måste vara minst 8 tecken.")
    setPending(true)
    const { data, error: authError } = await getSupabase().auth.updateUser({ password })
    setPending(false)
    if (authError || !data.user) return setError(authErrorMessage(authError) ?? "Länken har gått ut. Begär en ny.")
    window.location.href = homeFor(roleFromClaims(data.user))
  }

  return (
    <AuthCard title="Välj nytt lösenord">
      <form onSubmit={submit} className="space-y-4">
        <FormError message={error} />
        <div className="space-y-2">
          <Label htmlFor="password">Nytt lösenord</Label>
          <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
        </div>
        <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>
          Spara lösenord
        </Button>
      </form>
    </AuthCard>
  )
}
