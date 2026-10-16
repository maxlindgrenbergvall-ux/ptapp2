import Link from "next/link"
import type * as React from "react"

import { BrandLogo } from "@/components/brand"
import { Button } from "@/components/ui/button"

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col px-4 py-6">
      <header className="flex items-center justify-between">
        <BrandLogo />
      </header>
      <div className="flex flex-1 flex-col justify-center gap-6 py-10">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {children}
        {footer && <div className="text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </main>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  )
}

/** Översätter Supabase Auth-fel till svenska. */
export function authErrorMessage(error: { message: string; code?: string } | null): string | null {
  if (!error) return null
  const code = error.code ?? ""
  if (code === "invalid_credentials" || /invalid login credentials/i.test(error.message)) return "Fel e-post eller lösenord."
  if (code === "email_not_confirmed") return "Bekräfta din e-postadress först – kolla inkorgen."
  if (code === "user_already_exists" || /already registered/i.test(error.message)) return "Det finns redan ett konto med den e-postadressen."
  if (code === "weak_password") return "Lösenordet är för svagt. Använd minst 8 tecken och blanda gärna bokstäver och siffror."
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit") return "För många försök. Vänta en stund och försök igen."
  if (code === "provider_disabled" || /provider is not enabled|unsupported provider/i.test(error.message))
    return "Inloggningsmetoden är inte aktiverad än. Använd e-post och lösenord så länge."
  if (code === "phone_exists") return "Telefonnumret används redan av ett annat konto."
  if (/fetch|network/i.test(error.message)) return "Ingen kontakt med servern. Kontrollera uppkopplingen."
  return error.message
}

/** Lösenordsflöden kräver riktiga konton (Supabase). */
export function DemoNotice() {
  return (
    <AuthCard
      title="Demoläge"
      description="Supabase är inte konfigurerat, så lösenord kan inte återställas. Sätt NEXT_PUBLIC_SUPABASE_URL och NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (se .env.example)."
    >
      <Button asChild size="lg" className="h-11 w-full">
        <Link href="/">Till startsidan</Link>
      </Button>
    </AuthCard>
  )
}
