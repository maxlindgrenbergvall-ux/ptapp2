"use client"

import { Mail } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { fetchMarketingConsent, OnboardingError, setMarketingConsent } from "@/lib/onboarding-client"

/**
 * Nyhetsbrev, erbjudanden och produktnyheter (v34). Valet görs i intro-flödet
 * och kan ändras här när som helst – varje ändring loggas i databasen
 * (consent_events) med tidpunkt och källa.
 */
export function MarketingConsentCard() {
  const [value, setValue] = React.useState<boolean | null>(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    fetchMarketingConsent()
      .then((v) => !cancelled && setValue(v))
      .catch(() => !cancelled && setValue(false))
    return () => {
      cancelled = true
    }
  }, [])

  const change = async (next: boolean) => {
    const before = value
    setValue(next)
    setSaving(true)
    try {
      await setMarketingConsent(next)
      toast.success(next ? "Du får nyhetsbrev och erbjudanden" : "Du får inte längre nyhetsbrev och erbjudanden")
    } catch (e) {
      setValue(before)
      toast.error("Valet kunde inte sparas", { description: e instanceof OnboardingError ? e.message : "Försök igen." })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="gap-3" data-testid="marketing-settings">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="size-4" /> Nyhetsbrev och erbjudanden
        </CardTitle>
        <CardDescription>Valfritt. Påverkar inte ditt konto eller avtalet.</CardDescription>
      </CardHeader>
      <CardContent>
        <label htmlFor="marketing-settings" className="flex cursor-pointer items-start gap-3 text-sm">
          <Checkbox
            id="marketing-settings"
            checked={value === true}
            disabled={value === null || saving}
            onCheckedChange={(v) => void change(v === true)}
            className="mt-0.5 size-5"
            data-testid="marketing-toggle"
          />
          <span>Skicka nyhetsbrev, erbjudanden och produktnyheter till mig (e-post och notiser).</span>
        </label>
      </CardContent>
    </Card>
  )
}
