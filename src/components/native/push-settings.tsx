"use client"

import { Bell } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { isNativeApp } from "@/lib/native/app"
import { disablePush, enablePush, pushState, type PushState } from "@/lib/native/push"

/**
 * Push-notiser – visas bara i Coavira-appen. Appen frågar om lov först när
 * användaren slår på det här (inte direkt vid start).
 */
export function PushSettingsCard() {
  const [state, setState] = React.useState<PushState | "loading">("loading")
  const [native, setNative] = React.useState(false)

  React.useEffect(() => {
    if (!isNativeApp()) return
    let active = true
    void pushState().then((s) => {
      if (!active) return
      setNative(true)
      setState(s)
    })
    return () => {
      active = false
    }
  }, [])

  if (!native) return null

  const toggle = async (on: boolean) => {
    if (!on) {
      await disablePush()
      setState("off")
      toast("Push-notiser är avstängda på den här enheten")
      return
    }
    const next = await enablePush()
    setState(next)
    if (next === "on") toast.success("Push-notiser är påslagna")
    if (next === "denied") toast.error("Notiser är avstängda för Coavira", { description: "Slå på dem i telefonens inställningar." })
  }

  return (
    <Card className="gap-3" data-testid="push-settings">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="size-4" /> Push-notiser
        </CardTitle>
        <CardDescription>
          {state === "unavailable"
            ? "Push-notiser kommer i en kommande version av appen."
            : state === "denied"
              ? "Notiser är avstängda för Coavira i telefonens inställningar."
              : "Få en notis om nya meddelanden, bokningar och pass."}
        </CardDescription>
      </CardHeader>
      {state !== "unavailable" && (
        <CardContent>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={state === "on"}
              disabled={state === "loading" || state === "denied"}
              onCheckedChange={(v) => void toggle(v === true)}
            />{" "}
            Notiser på den här enheten
          </label>
        </CardContent>
      )}
    </Card>
  )
}
