"use client"

import { ChevronRight, Save, Target } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { AvatarPicker } from "@/components/avatar-picker"
import { LeaveTrainerButton, OfferingBadges } from "@/components/client/trainer-profile"
import { PersonAvatar } from "@/components/common"
import { InterestPicker } from "@/components/progress/metrics"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { myTrainers } from "@/lib/data/selectors"
import { useAppData } from "@/lib/data/store"
import { metricsFor } from "@/lib/interests"

/**
 * Profilinställningar för klienten: namn, intressen och mål (styr mätpunkterna
 * i Framsteg och syns för klientens PT:er) samt klientens PT:er.
 */
export function ClientProfileSettings() {
  const { data, me, actions } = useAppData()
  const client = data.clients.find((c) => c.id === me.id)!
  const [name, setName] = React.useState(client.name)
  const [interests, setInterests] = React.useState<string[]>(client.interests ?? [])
  const [focus, setFocus] = React.useState(client.focus ?? "")
  const [avatarUrl, setAvatarUrl] = React.useState(client.avatarUrl ?? "")
  const dirty = avatarUrl !== (client.avatarUrl ?? "") || name !== client.name || focus !== (client.focus ?? "") || interests.join() !== (client.interests ?? []).join()
  const trainers = myTrainers(data, me.id)
  const metrics = metricsFor(interests)

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return toast.error("Ange ditt namn")
          actions.updateProfile({ name, interests, focus, avatarUrl: avatarUrl || undefined })
          toast.success("Profilen är sparad", { description: "Framsteg visar nu mätpunkter för dina intressen." })
        }}
      >
        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="text-base">Personuppgifter</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Profilbilden syns för klientens PT:er: i översikten, klientlistan, chatten och vid köp. */}
            <AvatarPicker name={name || client.name} value={avatarUrl} userId={me.id} onChange={setAvatarUrl} />
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Namn</Label>
              <Input id="profile-name" autoComplete="name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {me.email && <p className="text-xs text-muted-foreground">E-post: {me.email}</p>}
          </CardContent>
        </Card>

        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="size-4 text-primary" /> Intressen och mål
            </CardTitle>
            <CardDescription>Styr vilka mätpunkter du ser under Framsteg. Dina PT:er ser dina intressen och mål.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <InterestPicker value={interests} onChange={setInterests} />
            {metrics.length > 0 && (
              <p className="text-xs text-muted-foreground" data-testid="metric-preview">
                Mätpunkter: {metrics.map((m) => m.metric.label).join(" · ")}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="profile-focus">Vad vill du utveckla?</Label>
              <Textarea
                id="profile-focus"
                rows={3}
                maxLength={300}
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                placeholder="T.ex. under 15 minuter på milen, eller 100 kg i knäböj"
              />
            </div>
          </CardContent>
        </Card>

        <div className="sticky bottom-20 z-10 flex justify-end">
          <Button type="submit" disabled={!dirty} className="shadow-lg">
            <Save /> Spara profilen
          </Button>
        </div>
      </form>

      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="text-base">Mina PT:er</CardTitle>
          <CardDescription>Du kan träna med flera PT:er samtidigt, men bara ha ett aktivt kostschema åt gången.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {trainers.length === 0 && <p className="text-sm text-muted-foreground">Du har ingen PT just nu.</p>}
          {trainers.map((t) => (
            <div key={t.id} className="space-y-1 rounded-xl border p-3">
              <Link href={`/klient/hitta/${t.id}`} className="flex items-center gap-3">
                <PersonAvatar name={t.name} src={t.avatarUrl} className="size-9" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{t.name}</span>
                  <OfferingBadges trainer={t} className="justify-start" />
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
              <LeaveTrainerButton trainer={t} className="h-8 justify-start px-2 text-xs" />
            </div>
          ))}
          <Button asChild variant="outline" className="w-full">
            <Link href="/klient/hitta">Hitta fler PT:er</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
