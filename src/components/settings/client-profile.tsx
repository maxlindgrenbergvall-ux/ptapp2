"use client"

import { ChevronRight, Save, Target } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { AvatarPicker } from "@/components/avatar-picker"
import { LeaveTrainerButton, OfferingBadges } from "@/components/client/trainer-profile"
import { PersonAvatar } from "@/components/common"
import { GoalPills } from "@/components/goals/goal-pills"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { myTrainers } from "@/lib/data/selectors"
import { useAppData } from "@/lib/data/store"

/**
 * Profilinställningar för klienten (v32, rensad): namn och profilbild, de
 * valda målen som piller (ändras under Mål) och klientens PT:er. Intressena
 * (mätpunkterna) väljs under Framsteg.
 */
export function ClientProfileSettings() {
  const { data, me, actions } = useAppData()
  const client = data.clients.find((c) => c.id === me.id)!
  const [name, setName] = React.useState(client.name)
  const [avatarUrl, setAvatarUrl] = React.useState(client.avatarUrl ?? "")
  const dirty = avatarUrl !== (client.avatarUrl ?? "") || name !== client.name
  const trainers = myTrainers(data, me.id)
  const goals = data.goalProfiles.find((g) => g.clientId === me.id)

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return toast.error("Ange ditt namn")
          actions.updateProfile({ name, avatarUrl: avatarUrl || undefined })
          toast.success("Profilen är sparad")
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

        <div className="sticky bottom-20 z-10 flex justify-end">
          <Button type="submit" disabled={!dirty} className="shadow-lg">
            <Save /> Spara profilen
          </Button>
        </div>
      </form>

      {/* v32: bara de mål du valt – som piller. Ändras under Mål. */}
      <Card className="gap-3" data-testid="profile-goals">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="size-4 text-primary" /> Mina mål
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {goals?.goals.length ? <GoalPills goals={goals.goals} /> : <p className="text-sm text-muted-foreground">Du har inte valt några mål än.</p>}
          <Button asChild variant="outline" size="sm">
            <Link href="/klient/profil/mal">
              {goals ? "Ändra mål" : "Välj mål"} <ChevronRight />
            </Link>
          </Button>
        </CardContent>
      </Card>

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
