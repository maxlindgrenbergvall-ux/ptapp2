"use client"

import { CalendarDays, Home, LineChart, MessageCircle, Search } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type * as React from "react"

import { AppMenu } from "@/components/app-menu"
import { useUnreadCount } from "@/components/chat/chat-thread"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { SyncIndicator } from "@/components/sync-indicator"
import { useAppData } from "@/lib/data/store"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/klient", label: "Idag", icon: Home, exact: true },
  { href: "/klient/kalender", label: "Kalender", icon: CalendarDays },
  { href: "/klient/hitta", label: "Hitta PT", icon: Search },
  { href: "/klient/framsteg", label: "Framsteg", icon: LineChart },
  { href: "/klient/chatt", label: "Chatt", icon: MessageCircle },
]

export function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { me, sync } = useAppData()
  const unread = useUnreadCount(me.id, [me.id])
  const { data } = useAppData()
  const nowIso = new Date().toISOString()
  // Prick på Kalender när ett preliminärt pass väntar (på PT:n eller på mitt svar).
  const pendingCount = data.events.filter((e) => e.clientId === me.id && e.status === "pending" && e.end > nowIso).length
  // Under ett pågående pass tar loggern hela skärmen – inga distraktioner.
  const focusMode = pathname.startsWith("/klient/pass/")

  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col md:border-x">
      {!focusMode && (
        <header className="sticky top-0 z-20 flex h-[calc(3.5rem+var(--safe-top))] items-center pt-[var(--safe-top)] justify-between border-b bg-background/80 px-4 backdrop-blur">
          <AppMenu />
          <div className="flex items-center gap-1">
            <NotificationBell />
          </div>
        </header>
      )}
      {!focusMode && sync.pending > 0 && (
        <div className="px-4 pt-3">
          <SyncIndicator />
        </div>
      )}
      <main className={cn("flex-1", !focusMode && "px-4 pt-4 pb-24")}>{children}</main>
      {!focusMode && (
        <nav
          aria-label="Huvudmeny"
          className="fixed inset-x-0 bottom-0 z-20 mx-auto grid max-w-lg grid-cols-5 border-t bg-background/95 pb-[var(--safe-bottom)] backdrop-blur md:border-x"
        >
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] transition-colors",
                  active ? "font-medium text-foreground" : "text-muted-foreground"
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.4 : 1.8} />
                {label}
                {href === "/klient/kalender" && pendingCount > 0 && (
                  <span
                    className="absolute top-2 left-1/2 ml-2 size-2 rounded-full bg-warning ring-2 ring-background"
                    aria-label={`${pendingCount} väntar på bekräftelse`}
                  />
                )}
                {href === "/klient/chatt" && unread > 0 && (
                  <span className="absolute top-2 left-1/2 ml-2 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] font-semibold text-brand-foreground tabular">
                    {unread}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
      )}
    </div>
  )
}
