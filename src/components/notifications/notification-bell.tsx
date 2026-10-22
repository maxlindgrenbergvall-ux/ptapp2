"use client"

import { Bell, CalendarCheck, CalendarClock, CalendarPlus, CalendarX2, Check, Sparkles, X, type LucideIcon } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "sonner"

import { BoostedBadge } from "@/components/boost/boost"
import { ProposeTimeDialog } from "@/components/calendar/propose-time-dialog"
import { PersonAvatar } from "@/components/common"
import { OfferCard } from "@/components/offers/offer-card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { matchBoostedTrainers } from "@/lib/boost"
import { useAppData } from "@/lib/data/store"
import { todayISO } from "@/lib/date"
import { describeGroup, groupNotifications, timeAgo, type NotificationGroup } from "@/lib/notifications/present"
import { matchOffers, useInterests } from "@/lib/offers/interests"
import { cn } from "@/lib/utils"
import { SPECIALTY_LABEL, type CalendarEvent, type NotificationKind } from "@/types/domain"

const ICON: Record<NotificationKind, LucideIcon> = {
  booking_requested: CalendarPlus,
  booking_proposed: CalendarClock,
  booking_confirmed: CalendarCheck,
  booking_declined: CalendarX2,
  event_cancelled: CalendarX2,
  event_rescheduled: CalendarClock,
  reschedule_accepted: CalendarCheck,
}
const ICON_TONE: Partial<Record<NotificationKind, string>> = {
  booking_confirmed: "text-primary",
  reschedule_accepted: "text-primary",
  event_cancelled: "text-destructive",
  booking_declined: "text-destructive",
  event_rescheduled: "text-warning",
  booking_proposed: "text-warning",
  booking_requested: "text-warning",
}

const MAX_GROUPS = 20

/**
 * Aviseringsmenyn i headern: kalenderhändelser från motparten (avbokningar,
 * ombokningar, bekräftelser) och – för klienter – personliga PT-erbjudanden
 * baserade på kategorier klienten tittat på.
 */
export function NotificationBell({ align = "end" }: { align?: "start" | "end" }) {
  const { data, me, actions } = useAppData()
  const [open, setOpen] = React.useState(false)
  const [proposeFor, setProposeFor] = React.useState<CalendarEvent | null>(null)
  const isClient = me.role === "client"
  const interests = useInterests(me.id)

  const mine = React.useMemo(() => data.notifications.filter((n) => n.userId === me.id), [data.notifications, me.id])
  const groups = React.useMemo(() => groupNotifications(mine).slice(0, MAX_GROUPS), [mine])
  const unread = mine.filter((n) => !n.readAt).length

  const offers = React.useMemo(
    () => (isClient && interests.enabled ? matchOffers(data.offers, interests.scores, { dismissed: interests.dismissed, today: todayISO() }) : []),
    [isClient, interests.enabled, interests.scores, interests.dismissed, data.offers]
  )
  // PT Boost: utvalda PT:er inom klientens intressen (bara med personliga erbjudanden påslagna).
  const featured = React.useMemo(() => {
    if (!isClient || !interests.enabled) return []
    const mine = data.relationships.filter((r) => r.clientId === me.id && r.status !== "ended").map((r) => r.trainerId)
    return matchBoostedTrainers(data.trainers, interests.scores, { dismissed: interests.dismissed, excludeTrainerIds: mine })
  }, [isClient, interests.enabled, interests.scores, interests.dismissed, data.relationships, data.trainers, me.id])
  const unseenOffers = [...offers, ...featured].filter((o) => !interests.seen.includes(o.id)).length
  const badge = unread + unseenOffers

  const markAllRead = () => actions.markNotificationsRead(mine.filter((n) => !n.readAt).map((n) => n.id))

  const onOpenChange = (o: boolean) => {
    setOpen(o)
    if (o) {
      if (offers.length || featured.length) interests.markSeen([...offers, ...featured].map((x) => x.id))
    } else {
      // Det man sett när menyn var öppen räknas som läst.
      markAllRead()
    }
  }

  const trainerName = (id: string) => data.trainers.find((t) => t.id === id)?.name
  const topCategories = interests.scores.slice(0, 3).map((s) => SPECIALTY_LABEL[s.category])

  return (
    <>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative" aria-label={badge ? `Aviseringar, ${badge} nya` : "Aviseringar"}>
            <Bell />
            {badge > 0 && (
              <span
                aria-hidden
                className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white tabular ring-2 ring-background"
              >
                {badge > 9 ? "9+" : badge}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align={align} sideOffset={8} className="flex max-h-[min(36rem,80svh)] w-[min(24rem,calc(100vw-1.5rem))] flex-col p-0">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="font-semibold">Aviseringar</h2>
            {unread > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>
                <Check /> Markera alla som lästa
              </Button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {groups.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Inga aviseringar än. Här hamnar avbokningar, ombokningar och bekräftelser.
              </p>
            ) : (
              <ul className="divide-y" aria-label="Aviseringar">
                {groups.map((g) => (
                  <NotificationItem
                    key={g.id}
                    group={g}
                    onNavigate={() => onOpenChange(false)}
                    onPropose={(e) => {
                      onOpenChange(false)
                      setProposeFor(e)
                    }}
                  />
                ))}
              </ul>
            )}

            {isClient && (
              <section className="space-y-2 border-t bg-muted/30 px-4 py-3" aria-labelledby="offers-heading">
                <h3 id="offers-heading" className="flex items-center gap-1.5 text-sm font-semibold">
                  <Sparkles className="size-4 text-primary" /> Erbjudanden för dig
                </h3>
                {!interests.enabled ? (
                  <p className="text-xs text-muted-foreground">Personliga erbjudanden är avstängda.</p>
                ) : offers.length === 0 && featured.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Utforska inriktningar under <span className="font-medium">Hitta PT</span> så tipsar vi om erbjudanden som passar dig.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {featured.map((f) => (
                      <div key={f.id} className="relative flex items-center gap-3 rounded-xl border border-brand/50 bg-background p-2.5" data-testid="featured-trainer">
                        <PersonAvatar name={f.trainer.name} src={f.trainer.avatarUrl} className="size-9" />
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/klient/hitta/${f.trainer.id}`}
                            onClick={() => {
                              interests.record([f.category], "offer")
                              onOpenChange(false)
                            }}
                            className="flex items-center gap-1.5 text-sm font-medium after:absolute after:inset-0 hover:underline"
                          >
                            <span className="truncate">{f.trainer.name}</span>
                            <BoostedBadge className="shrink-0" />
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">
                            Annons · {SPECIALTY_LABEL[f.category]} i {f.trainer.city}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="relative z-10 size-7 shrink-0"
                          aria-label={`Dölj ${f.trainer.name}`}
                          onClick={() => {
                            interests.dismiss(f.id)
                            toast("Rekommendationen är dold")
                          }}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                    {offers.map((o) => {
                      const t = trainerName(o.trainerId)
                      return (
                        <OfferCard
                          key={o.id}
                          compact
                          offer={o}
                          trainer={t ? { id: o.trainerId, name: t } : undefined}
                          reason={`För att du tittat på ${SPECIALTY_LABEL[o.category]}`}
                          onOpen={() => {
                            interests.record([o.category], "offer")
                            onOpenChange(false)
                          }}
                          onDismiss={() => {
                            interests.dismiss(o.id)
                            toast("Erbjudandet är dolt")
                          }}
                        />
                      )
                    })}
                  </div>
                )}
                <div className="space-y-1 pt-1 text-xs text-muted-foreground">
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={interests.enabled}
                      onCheckedChange={(v) => {
                        interests.setEnabled(v === true)
                        if (v !== true) toast("Personliga erbjudanden avstängda – historiken är raderad")
                      }}
                      aria-label="Personliga erbjudanden"
                    />
                    Personliga erbjudanden
                  </label>
                  {interests.enabled && (
                    <p>
                      {topCategories.length ? `Baserat på: ${topCategories.join(", ")}. ` : ""}
                      Historiken sparas bara på den här enheten.{" "}
                      {topCategories.length > 0 && (
                        <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={interests.clear}>
                          Rensa
                        </button>
                      )}
                    </p>
                  )}
                </div>
              </section>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {isClient && <ProposeTimeDialog event={proposeFor} onOpenChange={(o) => !o && setProposeFor(null)} />}
    </>
  )
}

function NotificationItem({
  group,
  onNavigate,
  onPropose,
}: {
  group: NotificationGroup
  onNavigate: () => void
  onPropose: (e: CalendarEvent) => void
}) {
  const { data, me, actions } = useAppData()
  const { title, detail, previous } = describeGroup(group, me.role)
  const Icon = ICON[group.kind]
  const event = group.items[0].eventId ? data.events.find((e) => e.id === group.items[0].eventId) : undefined
  // Svar direkt i menyn när passet fortfarande väntar på mig.
  const awaitingMe =
    event?.status === "pending" && new Date(event.end) > new Date() && event.awaiting === (me.role === "client" ? "client" : "trainer")
  const href = me.role === "client" ? "/klient/kalender" : "/pt/kalender"

  return (
    <li className={cn("relative px-4 py-3", group.unread && "bg-primary/5")}>
      <div className="flex gap-3">
        <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted", ICON_TONE[group.kind])}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <Link href={href} onClick={onNavigate} className="block text-sm font-medium after:absolute after:inset-0 hover:underline">
            {title}
          </Link>
          {detail && <p className="text-xs text-muted-foreground tabular">{detail}</p>}
          {previous && (
            <p className="text-xs text-muted-foreground tabular">
              Tidigare: <span className="line-through">{previous}</span>
            </p>
          )}
          <p className="mt-0.5 text-[11px] text-muted-foreground">{timeAgo(group.createdAt)}</p>
          {awaitingMe && event && (
            <div className="relative z-10 mt-2 flex flex-wrap gap-1.5">
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  if (me.role === "client") actions.acceptProposal(event.id)
                  else actions.respondToRequest(event.id, true)
                  toast.success(me.role === "client" ? "Tiden är accepterad" : "Bokningen är bekräftad")
                }}
              >
                <Check /> Acceptera
              </Button>
              {me.role === "client" ? (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onPropose(event)}>
                  <CalendarClock /> Föreslå ny tid
                </Button>
              ) : (
                <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                  <Link href={href} onClick={onNavigate}>
                    Visa i kalendern
                  </Link>
                </Button>
              )}
            </div>
          )}
        </div>
        {group.unread && <span aria-label="Oläst" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
      </div>
    </li>
  )
}
