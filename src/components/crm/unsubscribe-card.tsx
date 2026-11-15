"use client"

import { Check } from "lucide-react"
import * as React from "react"

import { AuthCard } from "@/components/auth/auth-card"
import { Button } from "@/components/ui/button"
import { BRAND } from "@/lib/brand"

export function UnsubscribeCard({ token }: { token: string }) {
  const [state, setState] = React.useState<"idle" | "busy" | "done" | "error">("idle")
  const confirm = async () => {
    setState("busy")
    try {
      const res = await fetch(`/api/crm/unsubscribe?token=${encodeURIComponent(token)}`, { method: "POST" })
      setState(res.ok ? "done" : "error")
    } catch {
      setState("error")
    }
  }
  if (state === "done") {
    return (
      <AuthCard title="Du är avregistrerad" description={`Du får inga fler mejl från ${BRAND.name}.`}>
        <p className="rise-in flex items-start gap-3 text-sm leading-relaxed text-muted-foreground" role="status" data-testid="unsubscribed">
          <span className="settle-in mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-3.5" strokeWidth={3} />
          </span>
          Vi har raderat dina kontaktuppgifter och spärrat adressen, så att den inte kan läggas till igen.
        </p>
      </AuthCard>
    )
  }
  return (
    <AuthCard title="Avregistrera" description={`Vill du sluta få mejl från ${BRAND.name}?`}>
      <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
        <p>Tryck på knappen, så raderar vi dina kontaktuppgifter och hör inte av oss igen.</p>
        <Button className="w-full" size="lg" onClick={confirm} disabled={state === "busy"} data-testid="unsubscribe-confirm">
          {state === "busy" ? "Avregistrerar …" : "Ja, avregistrera mig"}
        </Button>
        {state === "error" && (
          <p role="alert" className="text-destructive">
            Det gick inte just nu. Försök igen, eller mejla {BRAND.contactEmail} så tar vi bort dig.
          </p>
        )}
      </div>
    </AuthCard>
  )
}
