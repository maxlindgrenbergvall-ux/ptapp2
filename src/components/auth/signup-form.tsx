"use client"

import { MailCheck } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { AuthCard, authErrorMessage, FormError } from "@/components/auth/auth-card"
import { DemoNotice } from "@/components/auth/login-form"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getSupabase } from "@/lib/supabase/client"
import { HOME_FOR_ROLE, isSupabaseEnabled, type UserRole } from "@/lib/supabase/config"
import { cn } from "@/lib/utils"

const MIN_PASSWORD = 8

export function SignupForm() {
  const [role, setRole] = React.useState<UserRole>("client")
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [consent, setConsent] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [sentTo, setSentTo] = React.useState<string | null>(null)

  if (!isSupabaseEnabled) return <DemoNotice />

  if (sentTo) {
    return (
      <AuthCard title="Kolla din e-post" description={<>Vi har skickat en bekräftelselänk till <strong>{sentTo}</strong>. Klicka på den för att aktivera kontot.</>}>
        <MailCheck className="mx-auto size-10 text-muted-foreground" />
        <Button asChild variant="outline" className="w-full">
          <Link href="/logga-in">Till inloggningen</Link>
        </Button>
      </AuthCard>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < MIN_PASSWORD) return setError(`Lösenordet måste vara minst ${MIN_PASSWORD} tecken.`)
    if (role === "client" && !consent) return setError("Du behöver godkänna behandlingen av hälsouppgifter för att skapa ett klientkonto.")

    setPending(true)
    const { data, error: authError } = await getSupabase().auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${HOME_FOR_ROLE[role]}`,
        // Läses av databastriggern handle_new_user() som skapar profilen.
        data: { role, full_name: name.trim(), health_data_consent: role === "client" ? consent : false },
      },
    })
    setPending(false)
    if (authError) return setError(authErrorMessage(authError))
    // Med e-postbekräftelse avstängd får vi en session direkt.
    if (data.session) window.location.href = HOME_FOR_ROLE[role]
    else setSentTo(email.trim())
  }

  return (
    <AuthCard
      title="Skapa konto"
      footer={
        <>
          Har du redan ett konto?{" "}
          <Link href="/logga-in" className="font-medium text-foreground underline underline-offset-4">
            Logga in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <FormError message={error} />
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="sr-only">Jag är</legend>
          {(
            [
              ["client", "Jag vill träna", "Hitta PT och följ dina scheman"],
              ["trainer", "Jag är PT", "Coacha klienter"],
            ] as const
          ).map(([value, title, sub]) => (
            <label
              key={value}
              className={cn(
                "cursor-pointer rounded-xl border p-3 text-sm transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                role === value ? "border-foreground bg-muted" : "hover:bg-muted/60"
              )}
            >
              <input type="radio" name="role" value={value} checked={role === value} onChange={() => setRole(value)} className="sr-only" />
              <span className="block font-medium">{title}</span>
              <span className="block text-xs text-muted-foreground">{sub}</span>
            </label>
          ))}
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor="name">Namn</Label>
          <Input id="name" autoComplete="name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">E-post</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Lösenord</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11"
            aria-describedby="password-hint"
          />
          <p id="password-hint" className="text-xs text-muted-foreground">
            Minst {MIN_PASSWORD} tecken.
          </p>
        </div>
        {role === "client" && (
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <Checkbox id="consent" checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
            <Label htmlFor="consent" className="text-sm leading-snug font-normal">
              Jag samtycker till att Forma behandlar mina hälsouppgifter (träning, vikt och kost) så att min PT kan coacha mig.
              Jag kan när som helst radera mitt konto och all data.{" "}
              <Link href="/integritet" target="_blank" className="underline underline-offset-4">
                Läs mer
              </Link>
            </Label>
          </div>
        )}
        <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>
          {pending ? "Skapar konto…" : "Skapa konto"}
        </Button>
      </form>
    </AuthCard>
  )
}
