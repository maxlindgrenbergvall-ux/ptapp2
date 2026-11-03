"use client"

import { Mail } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { SettingsToggleRow } from "@/components/settings/settings-list"
import { fetchMarketingConsent, OnboardingError, setMarketingConsent } from "@/lib/onboarding-client"

/**
 * Nyhetsbrev, erbjudanden och produktnyheter (v34). Valet görs i intro-flödet
 * (eller pop-upen, v36) och kan ändras här när som helst – varje ändring loggas
 * i databasen (consent_events) och synkas till Resend.
 */
function useMarketingConsent() {
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
  return { value, saving, change }
}

/** v37: nyhetsbrevet som en rad i en inställningslista (Profil och Inställningar). */
export function MarketingConsentRow() {
  const { value, saving, change } = useMarketingConsent()
  return (
    <SettingsToggleRow
      id="marketing-settings-checkbox"
      icon={Mail}
      label="Nyhetsbrev och erbjudanden"
      hint="Valfritt · e-post och notiser · påverkar inte kontot"
      checked={value === true}
      disabled={value === null || saving}
      onCheckedChange={(v) => void change(v)}
      testId="marketing-toggle"
      data-testid="marketing-settings"
    />
  )
}
