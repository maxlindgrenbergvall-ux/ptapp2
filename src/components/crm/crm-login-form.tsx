"use client"

import { useSearchParams } from "next/navigation"
import * as React from "react"

import { AuthCard, authErrorMessage, FormError } from "@/components/auth/auth-card"
import { OrDivider, SocialButtons } from "@/components/auth/social-buttons"
import { useAdminDark } from "@/components/crm/admin-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { safeNext } from "@/lib/auth-redirect"
import { getSupabase } from "@/lib/supabase/client"
import { isSupabaseEnabled } from "@/lib/supabase/config"

/**
 * Inloggning till det interna CRM:et (v48). Samma konton som i appen – men efter
 * inloggningen går man alltid till /admin/leads, inte till appens startsida.
 * Behörigheten (app_admins) avgörs sedan av servern.
 */
export function CrmLoginForm() {
  useAdminDark()
  const params = useSearchParams()
  const next = safeNext(params.get("next"))
  const target = next.startsWith("/admin") ? next : "/admin/leads"
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(params.get("fel") === "lank" ? "Länken var ogiltig eller har gått ut. Försök igen." : null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isSupabaseEnabled) {
      window.location.href = target
      return
    }
    setPending(true)
    setError(null)
    const { error: authError } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password })
    if (authError) {
      setError(authErrorMessage(authError) ?? "Inloggningen misslyckades.")
      setPending(false)
      return
    }
    // Hel sidladdning så att servern ser den nya sessionscookien.
    window.location.href = target
  }

  return (
    <AuthCard title="Coavira CRM" description="Logga in med ditt administratörskonto.">
      <SocialButtons next={target} onError={setError} />
      <OrDivider />
      <form onSubmit={submit} className="space-y-4" data-testid="crm-login">
        <FormError message={error} />
        <div className="space-y-2">
          <Label htmlFor="crm-email">E-post</Label>
          <Input id="crm-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="crm-password">Lösenord</Label>
          <Input id="crm-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Loggar in …" : "Logga in"}
        </Button>
      </form>
    </AuthCard>
  )
}
