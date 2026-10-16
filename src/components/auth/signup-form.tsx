"use client"

import { Eye, EyeOff, MailCheck } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { AuthCard, authErrorMessage, FormError } from "@/components/auth/auth-card"
import { OrDivider, SocialButtons } from "@/components/auth/social-buttons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { normalizePhone } from "@/lib/phone"
import { getSupabase } from "@/lib/supabase/client"
import { isSupabaseEnabled, ONBOARDING_PATH } from "@/lib/supabase/config"

export const MIN_PASSWORD = 8

/**
 * Registrering med e-post, telefonnummer och lösenord via Supabase Auth.
 *
 * - signUp() skapar användaren i auth.users. Telefonnumret skickas som metadata
 *   och sparas av triggern handle_new_user() på profilen (E.164).
 * - Registreringen skapar bara klientkonton. PT-konton skapas av Coavira.
 *   Namn och samtycke lämnas i välkomststeget efteråt, så att samma flöde
 *   fungerar för Apple och Google.
 * - Med e-postbekräftelse påslagen visas "Kolla din e-post"; länken leder via
 *   /auth/callback till välkomststeget.
 */
export function SignupForm() {
  const router = useRouter()
  const [email, setEmail] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [showPassword, setShowPassword] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [sentTo, setSentTo] = React.useState<string | null>(null)

  if (sentTo) {
    return (
      <AuthCard
        title="Kolla din e-post"
        description={
          <>
            Vi har skickat en bekräftelselänk till <strong>{sentTo}</strong>. Klicka på den för att aktivera kontot och slutföra registreringen.
          </>
        }
      >
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
    const normalized = normalizePhone(phone)
    if (!normalized) return setError("Ange ett giltigt telefonnummer, t.ex. 070-123 45 67.")
    if (password.length < MIN_PASSWORD) return setError(`Lösenordet måste vara minst ${MIN_PASSWORD} tecken.`)

    if (!isSupabaseEnabled) {
      toast.info("Demoläge: inget riktigt konto skapas", { description: "Välj kontotyp i nästa steg för att prova appen." })
      router.push(ONBOARDING_PATH)
      return
    }

    setPending(true)
    const { data, error: authError } = await getSupabase().auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${ONBOARDING_PATH}`,
        // Läses av databastriggern handle_new_user() som skapar profilen.
        data: { phone: normalized },
      },
    })
    setPending(false)
    if (authError) return setError(authErrorMessage(authError))
    // Supabase svarar utan fel men utan identiteter om e-posten redan finns (skydd mot kontouppräkning).
    if (data.user && data.user.identities?.length === 0) return setError("Det finns redan ett konto med den e-postadressen. Logga in i stället.")
    // Med e-postbekräftelse avstängd får vi en session direkt.
    if (data.session) window.location.href = ONBOARDING_PATH
    else setSentTo(email.trim())
  }

  return (
    <AuthCard
      title="Registrera dig"
      description="Skapa ditt Coavira-konto för att hitta en PT, boka pass och följa din träning."
      footer={
        <>
          Har du redan ett konto?{" "}
          <Link href="/logga-in" className="font-medium text-foreground underline underline-offset-4">
            Logga in
          </Link>
        </>
      }
    >
      <SocialButtons onError={setError} />
      <OrDivider />
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={error} />
        <div className="space-y-2">
          <Label htmlFor="email">E-post</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Telefonnummer</Label>
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            placeholder="070-123 45 67"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => {
              const n = normalizePhone(phone)
              if (n) setPhone(n)
            }}
            className="h-11"
            aria-describedby="phone-hint"
          />
          <p id="phone-hint" className="text-xs text-muted-foreground">
            Används för påminnelser om pass och när din PT behöver nå dig.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Lösenord</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 pr-11"
              aria-describedby="password-hint"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Dölj lösenordet" : "Visa lösenordet"}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff /> : <Eye />}
            </Button>
          </div>
          <p id="password-hint" className="text-xs text-muted-foreground">
            Minst {MIN_PASSWORD} tecken.
          </p>
        </div>
        <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>
          {pending ? "Skapar konto…" : "Registrera dig"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Genom att registrera dig godkänner du att vi behandlar dina uppgifter enligt vår{" "}
          <Link href="/integritet" className="underline underline-offset-4">
            integritetspolicy
          </Link>
          .
        </p>
      </form>
    </AuthCard>
  )
}
