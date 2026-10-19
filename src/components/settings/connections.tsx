"use client"

import { CalendarDays, Watch } from "lucide-react"

import { CalendarSyncButton } from "@/components/calendar/calendar-sync-dialog"
import { WearablesCard } from "@/components/client/trackers"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAppData } from "@/lib/data/store"

const UPCOMING = ["Garmin Connect", "Strava", "Polar", "Oura"]

/** Anslutningar: wearables (sömn m.m.) och kalendersynk – samlade på ett ställe. */
export function ConnectionsPage() {
  const { me } = useAppData()
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {me.role === "client" && <WearablesCard />}
      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="size-4" /> Kalender
          </CardTitle>
          <CardDescription>Se dina pass i Google Kalender, Outlook eller Apple Kalender. Ändringar uppdateras automatiskt.</CardDescription>
        </CardHeader>
        <CardContent>
          <CalendarSyncButton />
        </CardContent>
      </Card>
      {me.role === "client" && (
        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Watch className="size-4" /> Fler enheter
            </CardTitle>
            <CardDescription>Fler kopplingar är på väg. Pass och tider från dem fylls i automatiskt under Framsteg.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {UPCOMING.map((n) => (
              <Badge key={n} variant="outline" className="font-normal text-muted-foreground">
                {n} · snart
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
