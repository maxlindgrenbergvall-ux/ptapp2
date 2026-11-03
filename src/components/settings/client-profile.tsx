"use client"

import { CalendarRange, ChevronRight, HeartPulse, Save, Settings, Target, Timer } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { AvatarPicker } from "@/components/avatar-picker"
import { LeaveTrainerButton, OfferingBadges } from "@/components/client/trainer-profile"
import { RestSettingsFields } from "@/components/client/rest-settings"
import { PersonAvatar } from "@/components/common"
import { GoalPills } from "@/components/goals/goal-pills"
import { MarketingConsentRow } from "@/components/settings/marketing-consent"
import { SettingsDialogRow, SettingsGroup, SettingsLinkRow } from "@/components/settings/settings-list"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { myTrainers } from "@/lib/data/selectors"
import { useAppData } from "@/lib/data/store"
import { formatRest, useRestPreference } from "@/lib/rest-timer"

/**
 * Profilen (v37, mobilstädad) – navet för klientens egna inställningar:
 *   1. Du: profilbild och namn i ett kompakt kort (spara-knappen i kortet).
 *   2. Mina mål: valda mål som piller + genvägen till Mål (en yta i stället för två).
 *   3. Träning: vilotid (dialog), hälsosynk/anslutningar, schema och splits,
 *      nyhetsbrev – flyttat hit från träningsvyn och Inställningar så att passet
 *      hålls rent. Vilotiden går fortfarande att ändra mitt i passet (Vila).
 *   4. Mina PT:er.
 */
export function ClientProfileSettings() {
  const { data, me, actions } = useAppData()
  const client = data.clients.find((c) => c.id === me.id)!
  const [name, setName] = React.useState(client.name)
  const [avatarUrl, setAvatarUrl] = React.useState(client.avatarUrl ?? "")
  const dirty = avatarUrl !== (client.avatarUrl ?? "") || name !== client.name
  const trainers = myTrainers(data, me.id)
  const goals = data.goalProfiles.find((g) => g.clientId === me.id)
  const [rest] = useRestPreference()

  return (
    <div className="mx-auto max-w-2xl space-y-4 sm:space-y-5">
      {/* 1. Du */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return toast.error("Ange ditt namn")
          actions.updateProfile({ name, avatarUrl: avatarUrl || undefined })
          toast.success("Profilen är sparad")
        }}
      >
        <Card className="gap-4" role="group" aria-label="Personuppgifter">
          <CardContent className="space-y-4">
            {/* Profilbilden syns för klientens PT:er: i översikten, klientlistan, chatten och vid köp. */}
            <AvatarPicker name={name || client.name} value={avatarUrl} userId={me.id} onChange={setAvatarUrl} size="sm" />
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Namn</Label>
              <Input id="profile-name" autoComplete="name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
              {me.email && <p className="text-xs text-muted-foreground">E-post: {me.email}</p>}
            </div>
            {dirty && (
              <Button type="submit" className="w-full sm:w-auto">
                <Save /> Spara profilen
              </Button>
            )}
          </CardContent>
        </Card>
      </form>

      {/* 2. Mina mål – piller + genväg till Mål (kalorimål, takt och prognos). */}
      <Card className="gap-3 py-0 sm:py-0" data-testid="profile-goals">
        <Link href="/klient/profil/mal" className="flex items-center gap-3 px-4 pt-4 pb-1 sm:px-6" data-testid="profile-goals-link">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Target className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Mina mål</span>
            <span className="block text-xs text-muted-foreground">Mål, vikt, kalorimål och takt</span>
          </span>
          <span className="flex items-center gap-0.5 text-xs font-medium text-primary">
            {goals ? "Ändra" : "Välj"} <ChevronRight className="size-4" />
          </span>
        </Link>
        <div className="px-4 pb-4 sm:px-6">
          {goals?.goals.length ? <GoalPills goals={goals.goals} size="sm" /> : <p className="text-sm text-muted-foreground">Du har inte valt några mål än.</p>}
        </div>
      </Card>

      {/* 3. Träning – inställningar som inte hör hemma i passets menyer. */}
      <SettingsGroup title="Träning" id="traning" className="scroll-mt-20" data-testid="profile-training">
        <SettingsDialogRow
          icon={Timer}
          label="Vilotid mellan set"
          hint={rest.mode === "fixed" ? "Alltid min vilotid" : "Passets vilotider"}
          value={formatRest(rest.seconds)}
          title="Vilotid"
          description="Standard för dina pass. Kan också ändras direkt i passet (Vila)."
          testId="profile-rest"
        >
          <RestSettingsFields />
        </SettingsDialogRow>
        <SettingsLinkRow href="/klient/anslutningar" icon={HeartPulse} label="Hälsosynk och anslutningar" hint="Apple Hälsa, Health Connect, Strava, klockor" />
        <SettingsLinkRow href="/klient/schema" icon={CalendarRange} label="Träningsschema och splits" hint="PPL, Upper/Lower, Full Body …" />
        <MarketingConsentRow />
        <SettingsLinkRow href="/klient/installningar" icon={Settings} label="Alla inställningar" />
      </SettingsGroup>

      {/* 4. Mina PT:er */}
      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="text-base">Mina PT:er</CardTitle>
          <CardDescription>Flera PT:er går bra – men bara ett aktivt kostschema åt gången.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {trainers.length === 0 && <p className="text-sm text-muted-foreground">Du har ingen PT just nu.</p>}
          {trainers.map((t) => (
            <div key={t.id} className="rounded-xl border p-2.5">
              <Link href={`/klient/hitta/${t.id}`} className="flex items-center gap-3">
                <PersonAvatar name={t.name} src={t.avatarUrl} className="size-9" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{t.name}</span>
                  <OfferingBadges trainer={t} className="justify-start" />
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
              <LeaveTrainerButton trainer={t} className="mt-1 h-8 justify-start px-2 text-xs" />
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
