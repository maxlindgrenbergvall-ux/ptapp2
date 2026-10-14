"use client"

import { Dumbbell, Home, LineChart, LogOut, MessageCircle, Search } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type * as React from "react"

import { useUnreadCount } from "@/components/chat/chat-thread"
import { SyncIndicator } from "@/components/sync-indicator"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { useAppData } from "@/lib/data/store"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/klient", label: "Idag", icon: Home, exact: true },
  { href: "/klient/hitta", label: "Hitta PT", icon: Search },
  { href: "/klient/framsteg", label: "Framsteg", icon: LineChart },
  { href: "/klient/chatt", label: "Chatt", icon: MessageCircle },
]

export function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { me, mode, signOut, sync } = useAppData()
  const unread = useUnreadCount(me.id, [me.id])
  // Under ett pågående pass tar loggern hela skärmen – inga distraktioner.
  const focusMode = pathname.startsWith("/klient/pass/")

  return (
    <div className="mx-auto flex min-h-svh max-w-lg flex-col md:border-x">
      {!focusMode && (
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-7 items-center justify-center rounded-md bg-brand text-brand-foreground">
              <Dumbbell className="size-3.5" />
            </span>
            Forma
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            {mode === "supabase" && (
              <Button variant="ghost" size="icon" aria-label="Logga ut" onClick={() => void signOut()}>
                <LogOut />
              </Button>
            )}
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
          className="fixed inset-x-0 bottom-0 z-20 mx-auto grid max-w-lg grid-cols-4 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:border-x"
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
