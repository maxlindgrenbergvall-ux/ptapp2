import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import type * as React from "react"

import { BrandLogo, BrandMark } from "@/components/brand"
import { Button } from "@/components/ui/button"

/** Fälten på inloggningssidorna – samma luftiga stil som introna (v80). */
export const AUTH_INPUT = "h-12 rounded-xl bg-muted/40 px-4 text-base"
export const AUTH_LABEL = "text-sm font-normal text-muted-foreground"

/**
 * Skalet för inloggning, registrering och lösenord (v80: renare): en
 * tillbakapil och loggan överst, EN rubrik och en kort mening, formuläret och
 * högst en rad länkar längst ned.
 */
export function AuthCard({
  title,
  description,
  children,
  footer,
  back,
}: {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  /** Tillbakapilen (t.ex. till Kom igång). Utan den visas loggan som länk. */
  back?: string
}) {
  return (
    <main className="mx-auto flex min-h-svh max-w-sm flex-col px-5 pt-[calc(var(--safe-top)+1rem)] pb-[calc(var(--safe-bottom)+1.5rem)]">
      <div className="app-backdrop" aria-hidden />
      <header className="flex h-10 items-center justify-between">
        {back ? (
          <>
            <Button asChild variant="ghost" size="icon" className="-ml-2 rounded-full">
              <Link href={back} aria-label="Tillbaka">
                <ArrowLeft />
              </Link>
            </Button>
            <BrandMark size="sm" />
          </>
        ) : (
          <BrandLogo />
        )}
      </header>
      <div className="page-enter flex flex-1 flex-col justify-center gap-6 py-8">
        <div className="space-y-1.5">
          <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight">{title}</h1>
          {description && <p className="text-[0.95rem] text-muted-foreground">{description}</p>}
        </div>
        {children}
      </div>
      {footer && <div className="pt-2 text-center text-sm text-muted-foreground">{footer}</div>}
    </main>
  )
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="animate-in rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive fade-in-0 slide-in-from-top-1">
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
