"use client"

/**
 * Klient: "Har du en inbjudningskod från din PT?" (Inställningar). Koden löses
 * in av databasen (redeem_pt_invite) – klienten kopplas direkt till PT:n som
 * befintlig klient och betalar 5 % serviceavgift hos hen i stället för 10 %.
 */
import { Check, KeyRound, Loader2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useAppData } from "@/lib/data/store"
import { EXISTING_CLIENT_FEE_PERCENT, PLATFORM_FEE_PERCENT } from "@/lib/payments/fees"
import { forgetPtInvite, normalizePtInviteCode, PT_INVITE_CODE, storedPtInvite } from "@/lib/pt-invites"

/** Fältet visar "EX-" + upp till 6 tecken medan klienten skriver. */
export function formatPtInviteInput(raw: string) {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "")
  const rest = (s.startsWith("EX") ? s.slice(2) : s).slice(0, 6)
  return rest ? `EX-${rest}` : s.slice(0, 2)
}

export function PtInviteRedeemCard() {
  const { data, me, actions } = useAppData()
  const [code, setCode] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState<string | null>(null)

  // Kod från PT:ns länk som inte lösts in än (t.ex. konto skapat i demoläget).
  React.useEffect(() => {
    const stored = storedPtInvite()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage finns bara i webbläsaren.
    if (stored) setCode(stored)
  }, [])

  const linked = data.relationships.filter((r) => r.clientId === me.id && r.acquisition === "EXISTING_CLIENT" && r.status !== "ended")
  const trainerName = (id: string) => data.trainers.find((t) => t.id === id)?.name ?? "din PT"

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setPending(true)
    const res = await actions.redeemPtInvite(code)
    setPending(false)
    if (res.error) return setError(res.error)
    forgetPtInvite()
    setCode("")
    setDone(res.trainerName ?? "din PT")
    toast.success(`Du är kopplad till ${res.trainerName ?? "din PT"}`, { description: `Serviceavgift ${EXISTING_CLIENT_FEE_PERCENT} % i stället för ${PLATFORM_FEE_PERCENT} %.` })
  }

  return (
    <Card className="gap-3" data-testid="pt-invite-redeem">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4" /> Har du en inbjudningskod från din PT?
        </CardTitle>
        <CardDescription>
          Tränar du redan med en PT utanför appen? Med PT:ns kod kopplas ni ihop direkt och du betalar {EXISTING_CLIENT_FEE_PERCENT} % serviceavgift i stället för{" "}
          {PLATFORM_FEE_PERCENT} %.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {linked.length > 0 && (
          <ul className="space-y-1 text-sm" data-testid="pt-invite-linked">
            {linked.map((r) => (
              <li key={r.trainerId} className="flex items-center gap-2 rounded-lg bg-emerald-600/10 px-3 py-2 text-emerald-800 dark:text-emerald-300">
                <Check className="size-4 shrink-0" aria-hidden /> Befintlig klient hos {trainerName(r.trainerId)} · {EXISTING_CLIENT_FEE_PERCENT} % serviceavgift
              </li>
            ))}
          </ul>
        )}
        {done && <p className="sr-only" role="status">Kopplad till {done}</p>}
        <form onSubmit={(e) => void submit(e)} className="space-y-2" noValidate>
          <div className="flex gap-2">
            <Input
              value={code}
              onChange={(e) => {
                setCode(formatPtInviteInput(e.target.value))
                setError(null)
              }}
              placeholder="EX-8FK29A"
              aria-label="Inbjudningskod från din PT"
              autoCapitalize="characters"
              autoComplete="off"
              className="font-mono tracking-widest uppercase"
            />
            <Button type="submit" disabled={pending || !PT_INVITE_CODE.test(normalizePtInviteCode(code))}>
              {pending && <Loader2 className="animate-spin" />} Koppla
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
