"use client"

import { Apple, Dumbbell, LayoutDashboard, LogOut, Menu, MessageSquare, RotateCcw, UserRound } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"

import { useUnreadCount } from "@/components/chat/chat-thread"
import { PersonAvatar } from "@/components/common"
import { SyncIndicator } from "@/components/sync-indicator"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useAppData } from "@/lib/data/store"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/pt", label: "Översikt", icon: LayoutDashboard, exact: true },
  { href: "/pt/pass", label: "Passbyggare", icon: Dumbbell },
  { href: "/pt/kost", label: "Kostscheman", icon: Apple },
  { href: "/pt/meddelanden", label: "Meddelanden", icon: MessageSquare },
  { href: "/pt/profil", label: "Min profil", icon: UserRound },
]

export function PtShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="flex min-h-svh">
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 border-r bg-sidebar lg:block">
        <SidebarContent />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Öppna meny">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Meny</SheetTitle>
              </SheetHeader>
              <SidebarContent onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <Logo />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <SyncIndicator className="mb-4" />
          {children}
        </main>
      </div>
    </div>
  )
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="flex size-7 items-center justify-center rounded-md bg-brand text-brand-foreground">
        <Dumbbell className="size-3.5" />
      </span>
      Forma <span className="text-xs font-normal text-muted-foreground">PT</span>
    </Link>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const { data, actions, me, mode, signOut } = useAppData()
  const trainer = data.trainers.find((t) => t.id === me.id)
  const clientIds = data.clients.filter((c) => c.trainerId === me.id).map((c) => c.id)
  const unread = useUnreadCount(me.id, clientIds)

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="hidden h-11 items-center px-2 lg:flex">
        <Logo />
      </div>
      <nav className="flex flex-col gap-1" aria-label="Huvudmeny">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              {label}
              {href === "/pt/meddelanden" && unread > 0 && (
                <span className="ml-auto rounded-full bg-brand px-1.5 text-xs font-semibold text-brand-foreground tabular">
                  {unread}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
      <div className="mt-auto space-y-2">
        {trainer && !trainer.isPublished && (
          <Link href="/pt/profil" onClick={onNavigate} className="block rounded-lg border border-dashed p-3 text-xs text-muted-foreground hover:bg-sidebar-accent/60">
            Din profil syns inte i sökningen än. <span className="font-medium text-foreground underline">Publicera den</span>
          </Link>
        )}
        <div className="flex items-center gap-1">
          {mode === "demo" ? (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={actions.resetDemo}>
              <RotateCcw /> Återställ demo
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void signOut()}>
              <LogOut /> Logga ut
            </Button>
          )}
          <div className="ml-auto hidden lg:block">
            <ThemeToggle />
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border p-2">
          <PersonAvatar name={me.name} src={trainer?.avatarUrl} className="size-9" />
          <div className="min-w-0 text-sm">
            <div className="truncate font-medium">{me.name}</div>
            <div className="truncate text-xs text-muted-foreground">Personlig tränare</div>
          </div>
        </div>
      </div>
    </div>
  )
}
