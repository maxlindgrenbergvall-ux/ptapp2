"use client"

import { Mail } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAppData } from "@/lib/data/store"
import { fetchOnboardingStatus, OnboardingError, setMarketingConsent } from "@/lib/onboarding-client"
import { isSupabaseEnabled } from "@/lib/supabase/config"

/** "Fråga mig senare" gäller inloggningen – nästa gång frågar vi igen. */
const laterKey = (uid: string) => `coavira:marketing-prompt-later:${uid}`

/**
 * Pop-up om nyhetsbrev (v36) för användare som registrerade sig innan frågan
 * fanns i onboardingen. Visas vid inloggning tills användaren valt ja eller nej
 * (databasen: my_onboarding_status → marketing_choice_needed). Svaret sparas
 * med källan "prompt" och ett ja lägger användaren i rätt Resend-segment.
 * Inget är förkryssat och ett nej påverkar inte kontot.
 */
export function MarketingPrompt({ suppressed = false }: { suppressed?: boolean }) {
  const { me } = useAppData()
  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState<"yes" | "no" | null>(null)
  const checked = React.useRef(false)

  React.useEffect(() => {
    if (!isSupabaseEnabled || suppressed || checked.current || me.onboardingCompleted === false) return
    checked.current = true
    try {
      if (sessionStorage.getItem(laterKey(me.id))) return
    } catch {
      // privat läge – fråga ändå
    }
    let cancelled = false
    // Lite efter att appen laddat, så att pop-upen inte krockar med startsidan.
    const t = setTimeout(() => {
      fetchOnboardingStatus()
        .then((s) => !cancelled && s?.marketing_choice_needed && setOpen(true))
        .catch(() => {})
    }, 800)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [me.id, me.onboardingCompleted, suppressed])

  const later = () => {
    try {
      sessionStorage.setItem(laterKey(me.id), "1")
    } catch {
      // ignoreras
    }
    setOpen(false)
  }

  const choose = async (granted: boolean) => {
    setSaving(granted ? "yes" : "no")
    try {
      await setMarketingConsent(granted, "prompt")
      setOpen(false)
      toast.success(granted ? "Tack! Du får nyhetsbrev och erbjudanden" : "Okej – inga nyhetsbrev", {
        description: "Du kan ändra dig när som helst under Inställningar.",
      })
    } catch (e) {
      toast.error("Valet kunde inte sparas", { description: e instanceof OnboardingError ? e.message : "Försök igen." })
    } finally {
      setSaving(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : later())}>
      <DialogContent className="sm:max-w-md" data-testid="marketing-prompt">
        <DialogHeader>
          <span className="mx-auto mb-1 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary sm:mx-0">
            <Mail className="size-6" />
          </span>
          <DialogTitle>Vill du ha nyheter från Coavira?</DialogTitle>
          <DialogDescription>
            Nyhetsbrev, erbjudanden och produktnyheter via e-post. Helt frivilligt, och du kan avsluta när som helst under Inställningar.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="h-11 sm:flex-1" disabled={saving !== null} onClick={() => void choose(false)} data-testid="marketing-prompt-no">
            Nej tack
          </Button>
          <Button className="h-11 sm:flex-1" disabled={saving !== null} onClick={() => void choose(true)} data-testid="marketing-prompt-yes">
            Ja tack
          </Button>
        </DialogFooter>
        <button type="button" onClick={later} className="mx-auto min-h-11 text-sm text-muted-foreground underline-offset-4 hover:underline" data-testid="marketing-prompt-later">
          Fråga mig senare
        </button>
      </DialogContent>
    </Dialog>
  )
}
