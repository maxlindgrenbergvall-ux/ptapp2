"use client"

import { Activity, AlertCircle, CalendarClock, CalendarDays, ChevronRight, MessageSquare, Users } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { RequestsPanel } from "@/components/calendar/requests-panel"
import { useUnreadCount } from "@/components/chat/chat-thread"
import { ClientStatusBadge, PageHeader, PersonAvatar, StatTile } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { adherence, lastCompleted, nextPlanned, workoutsFor } from "@/lib/data/selectors"
import { useAppData } from "@/lib/data/store"
import { addDays, formatShort, relativeDay, todayISO } from "@/lib/date"
import type { ClientStatus } from "@/types/domain"

type Filter = "all" | ClientStatus

export default function PtOverviewPage() {
  const { data, me } = useAppData()
  const [query, setQuery] = React.useState("")
  const [filter, setFilter] = React.useState<Filter>("all")
  const today = todayISO()

  const clients = data.clients.filter((c) => c.trainerId === me.id)
  const unread = useUnreadCount(me.id, clients.map((c) => c.id))

  const rows = clients
    .map((c) => {
      const ws = workoutsFor(data, c.id)
      return { client: c, last: lastCompleted(ws), next: nextPlanned(ws, today), adherence: adherence(ws, 28, today) }
    })
    .filter((r) => filter === "all" || r.client.status === filter)
    .filter((r) => r.client.name.toLowerCase().includes(query.trim().toLowerCase()))

  const weekAgo = addDays(today, -7)
  const loggedThisWeek = data.workouts.filter(
    (w) => clients.some((c) => c.id === w.clientId) && w.status === "completed" && w.date >= weekAgo
  ).length
  const activeClients = clients.filter((c) => c.status === "active")
  const avgAdherence = average(
    activeClients.map((c) => adherence(workoutsFor(data, c.id), 28, today)).filter((v): v is number => v !== null)
  )

  // "Behöver uppmärksamhet": det PT:n ska agera på idag.
  const attention = [
    ...clients
      .filter((c) => c.status === "pending")
      .map((c) => ({ id: `p-${c.id}`, clientId: c.id, text: `${c.name} vill börja träna med dig`, kind: "Ny klient" })),
    ...activeClients
      .filter((c) => {
        const last = lastCompleted(workoutsFor(data, c.id))
        return !last || last.date < addDays(today, -7)
      })
      .map((c) => ({ id: `i-${c.id}`, clientId: c.id, text: `${c.name} har inte loggat på över en vecka`, kind: "Inaktiv" })),
    ...data.workouts
      .filter((w) => clients.some((c) => c.id === w.clientId) && w.clientComment && w.date >= weekAgo)
      .map((w) => ({
        id: `f-${w.id}`,
        clientId: w.clientId,
        text: `Kommentar på ${w.name} (${formatShort(w.date)}): "${w.clientComment}"`,
        kind: "Feedback",
      })),
  ]


  return (
    <div className="space-y-6">
      <PageHeader title="Översikt" description={`Hej Elin! Så här ser det ut idag, ${formatShort(today)}`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Aktiva klienter" value={activeClients.length} sub={`${clients.length} totalt`} icon={Users} />
        <StatTile label="Loggade pass, 7 dagar" value={loggedThisWeek} icon={Activity} />
        <StatTile
          label="Snittföljsamhet, 4 v"
          value={avgAdherence === null ? "–" : `${avgAdherence} %`}
          sub="Genomförda av schemalagda pass"
          icon={CalendarClock}
        />
        <StatTile label="Olästa meddelanden" value={unread} icon={MessageSquare} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card className="min-w-0">
          <CardHeader className="gap-4">
            <div>
              <CardTitle>Klienter</CardTitle>
              <CardDescription>Status, senaste loggade pass och följsamhet de senaste 4 veckorna.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Sök klient…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-9 w-full sm:w-56"
                aria-label="Sök klient"
              />
              <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
                <TabsList>
                  <TabsTrigger value="all">Alla</TabsTrigger>
                  <TabsTrigger value="active">Aktiva</TabsTrigger>
                  <TabsTrigger value="paused">Pausade</TabsTrigger>
                  <TabsTrigger value="pending">Nya</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Klient</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Senaste pass</TableHead>
                  <TableHead className="hidden lg:table-cell">Nästa pass</TableHead>
                  <TableHead className="w-40">Följsamhet</TableHead>
                  <TableHead className="w-8 pr-6" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      Inga klienter matchar.
                    </TableCell>
                  </TableRow>
                )}
                {rows.map(({ client, last, next, adherence: adh }) => (
                  <TableRow key={client.id} className="group relative">
                    <TableCell className="pl-6">
                      <Link
                        href={`/pt/klienter/${client.id}`}
                        className="flex items-center gap-3 after:absolute after:inset-0 focus-visible:outline-none"
                      >
                        <PersonAvatar name={client.name} className="size-8" />
                        <div className="min-w-0">
                          <div className="font-medium">{client.name}</div>
                          <div className="max-w-56 truncate text-xs text-muted-foreground">{client.goal}</div>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <ClientStatusBadge status={client.status} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {last ? (
                        <div className="text-sm">
                          {last.name}
                          <div className="text-xs text-muted-foreground">{relativeDay(last.date, today)}</div>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">–</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-sm lg:table-cell">
                      {next ? `${next.name}, ${relativeDay(next.date, today)}` : <span className="text-muted-foreground">Inget planerat</span>}
                    </TableCell>
                    <TableCell>
                      {adh === null ? (
                        <span className="text-sm text-muted-foreground">–</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Progress value={adh} className="h-1.5" aria-label={`Följsamhet ${adh} procent`} />
                          <span className="w-10 text-right text-xs tabular">{adh} %</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="pr-6">
                      <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="size-4" /> Behöver uppmärksamhet
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {attention.length === 0 && <p className="text-sm text-muted-foreground">Allt lugnt just nu.</p>}
              {attention.map((a) => (
                <Link
                  key={a.id}
                  href={`/pt/klienter/${a.clientId}`}
                  className="block rounded-lg border p-3 text-sm transition-colors hover:bg-muted/60"
                >
                  <span className="text-xs font-medium text-muted-foreground">{a.kind}</span>
                  <p className="line-clamp-2">{a.text}</p>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3">
              <RequestsPanel compact />
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href="/pt/kalender">
                  <CalendarDays /> Öppna kalendern
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function average(values: number[]) {
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null
}
