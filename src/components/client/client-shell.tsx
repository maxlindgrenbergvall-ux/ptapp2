"use client"

import { CalendarDays, ChefHat, Home, LineChart, MessageCircle, Search } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type * as React from "react"

import { AppMenu } from "@/components/app-menu"
import { useUnreadCount } from "@/components/chat/chat-thread"
import { CartButton } from "@/components/cart/cart"
import { PersonAvatar } from "@/components/common"
import { Button } from "@/components/ui/button"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { SyncIndicator } from "@/components/sync-indicator"
import { useAppData } from "@/lib/data/store"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/klient", label: "Idag", icon: Home, exact: true },
  { href: "/klient/kalender", label: "Kalender", icon: CalendarDays },
  { href: "/klient/hitta", label: "Hitta PT", icon: Search },
  { href: "/klient/framsteg", label: "Framsteg", icon: LineChart },
  // Chatten ligger i headern (uppe till höger) – platsen i menyn används av Recept.
  { href: "/klient/recept", label: "Recept", icon: ChefHat },
]

export function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { me, sync } = useAppData()
  const unread = useUnreadCount(me.id, [me.id])
  const { data } = useAppData()
  const client = data.clients.find((c) => c.id === me.id)
  const nowIso = new Date().toISOString()
  // Prick på Kalender när ett preliminärt pass väntar (på PT:n eller på mitt svar).
  const pendingCount = data.events.filter((e) => e.clientId === me.id && e.status === "pending" && e.end > nowIso).length
  // Under ett pågående pass (och i intro-flödet) tar vyn hela skärmen – inga distraktioner.
  const focusMode = pathname.startsWith("/klient/pass/") || pathname === "/klient/intro"

  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col md:border-x md:border-border/60">
      <div className="app-backdrop" aria-hidden />
      {!focusMode && (
        <header className="sticky top-0 z-20 flex h-[calc(3.5rem+var(--safe-top))] items-center justify-between border-b border-border/60 bg-background/70 px-4 pt-[var(--safe-top)] backdrop-blur-xl backdrop-saturate-150">
          <AppMenu />
          {/* Uppe till höger: chatt, varukorg, aviseringar och profil. */}
          <div className="flex items-center gap-0.5">
            <Button
              asChild
              variant="ghost"
              size="icon"
              className={cn("relative", pathname.startsWith("/klient/chatt") && "bg-primary/12 text-primary")}
            >
              <Link href="/klient/chatt" aria-label={unread > 0 ? `Chatt, ${unread} olästa` : "Chatt"} data-testid="header-chat">
                <MessageCircle />
                {unread > 0 && (
                  <span
                    aria-hidden
                    className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-brand-foreground tabular ring-2 ring-background"
                  >
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
            </Button>
            <CartButton />
            <NotificationBell />
            <Link
              href="/klient/profil"
              aria-label="Profilinställningar"
              className="ml-0.5 flex size-9 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <PersonAvatar name={me.name} src={client?.avatarUrl} className="size-8" />
            </Link>
          </div>
        </header>
      )}
      {!focusMode && sync.pending > 0 && (
        <div className="px-4 pt-3">
          <SyncIndicator />
        </div>
      )}
      {/* Luft under innehållet för bottenmenyn (4rem) + hemindikatorn. */}
      <main className={cn("flex-1", !focusMode && "px-4 pt-4 pb-[calc(6rem+var(--safe-bottom))]")}>{children}</main>
      {!focusMode && (
        <nav
          aria-label="Huvudmeny"
          className="fixed inset-x-0 bottom-0 z-20 mx-auto grid max-w-lg grid-cols-5 border-t border-border/60 bg-background/75 pb-[var(--safe-bottom)] backdrop-blur-xl backdrop-saturate-150 md:border-x"
        >
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] transition-colors active:scale-95 motion-reduce:active:scale-100",
                  active ? "font-semibold text-foreground" : "text-muted-foreground"
                )}
              >
                {/* Aktiv flik: en mjuk "pill" som tonar och växer in bakom ikonen. */}
                <span
                  className={cn(
                    "flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-200",
                    active ? "animate-in fade-in-0 zoom-in-75 bg-primary/12 text-primary duration-300" : "group-hover:bg-muted/70"
                  )}
                >
                  <Icon className="size-5" strokeWidth={active ? 2.4 : 1.8} />
                </span>
                {label}
                {href === "/klient/kalender" && pendingCount > 0 && (
                  <span
                    className="absolute top-2 left-1/2 ml-2 size-2 rounded-full bg-warning ring-2 ring-background"
                    aria-label={`${pendingCount} väntar på bekräftelse`}
                  />
                )}
              </Link>
            )
          })}
        </nav>
      )}
    </div>
  )
}
