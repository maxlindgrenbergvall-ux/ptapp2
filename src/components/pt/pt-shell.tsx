"use client"

import { Apple, CalendarDays, Dumbbell, LayoutDashboard, LogOut, Menu, MessageSquare, RotateCcw, UserRound } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"

import { AppMenu } from "@/components/app-menu"
import { useUnreadCount } from "@/components/chat/chat-thread"
import { PersonAvatar } from "@/components/common"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { SyncIndicator } from "@/components/sync-indicator"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useAppData } from "@/lib/data/store"
import { PT_ONBOARDING_PATH } from "@/lib/supabase/config"
import { MarketingPrompt } from "@/components/settings/marketing-prompt"
import { useOnboardingGuard } from "@/components/onboarding/use-onboarding-guard"
import { cn } from "@/lib/utils"

/** `tab` = kort etikett i mobilens bottenmeny (v52). Min profil nås via menyn uppe till vänster. */
const NAV: { href: string; label: string; tab?: string; icon: typeof LayoutDashboard; exact?: boolean; also?: string[] }[] = [
  { href: "/pt", label: "Översikt", tab: "Översikt", icon: LayoutDashboard, exact: true, also: ["/pt/klienter"] },
  { href: "/pt/kalender", label: "Kalender", tab: "Kalender", icon: CalendarDays },
  { href: "/pt/pass", label: "Passbyggare", tab: "Pass", icon: Dumbbell },
  { href: "/pt/kost", label: "Kostscheman", tab: "Kost", icon: Apple },
  { href: "/pt/meddelanden", label: "Meddelanden", tab: "Chatt", icon: MessageSquare },
  { href: "/pt/profil", label: "Min profil", icon: UserRound },
]

/** Olästa meddelanden och väntande bokningsförfrågningar (prickar i menyerna). */
function useNavBadges() {
  const { data, me } = useAppData()
  const clientIds = data.clients.filter((c) => c.trainerId === me.id).map((c) => c.id)
  const unread = useUnreadCount(me.id, clientIds, me.id)
  const now = new Date().toISOString()
  const pendingRequests = data.events.filter((e) => e.trainerId === me.id && e.status === "pending" && e.awaiting !== "client" && e.end > now).length
  return { unread, pendingRequests }
}

/**
 * Bottenmenyn i PT-appen (v52): alltid synlig längst ner på mobil och surfplatta
 * (under lg, där sidomenyn tar över). Fem flikar – Översikt, Kalender,
 * Passbyggare, Kostscheman och Meddelanden – med hela namnet för skärmläsare
 * och en kort etikett som ryms på 320 px. Respekterar hemindikatorn (safe area).
 */
function BottomNav() {
  const pathname = usePathname()
  const { unread, pendingRequests } = useNavBadges()
  const tabs = NAV.filter((n) => n.tab)
  return (
    <nav
      aria-label="Bottenmeny"
      data-testid="pt-bottom-nav"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border/60 bg-background/80 pb-[var(--safe-bottom)] backdrop-blur-xl backdrop-saturate-150 lg:hidden"
    >
      {tabs.map(({ href, label, tab, icon: Icon, exact, also }) => {
        const active = exact ? pathname === href || Boolean(also?.some((p) => pathname.startsWith(p))) : pathname.startsWith(href)
        const badge = href === "/pt/meddelanden" ? unread : href === "/pt/kalender" ? pendingRequests : 0
        return (
          <Link
            key={href}
            href={href}
            aria-label={badge > 0 ? `${label}, ${badge} ${href === "/pt/meddelanden" ? "olästa" : "väntande förfrågningar"}` : label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex h-16 min-w-0 flex-col items-center justify-center gap-1 text-[11px] outline-none transition-colors active:scale-95 motion-reduce:active:scale-100",
              "focus-visible:bg-muted/60",
              active ? "font-semibold text-foreground" : "text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "relative flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-200",
                active ? "animate-in fade-in-0 zoom-in-75 bg-primary/12 text-primary duration-300" : "group-hover:bg-muted/70"
              )}
            >
              <Icon className="size-5" strokeWidth={active ? 2.4 : 1.8} />
              {badge > 0 && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute -top-1 right-0 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular ring-2 ring-background",
                    href === "/pt/meddelanden" ? "bg-brand text-brand-foreground" : "bg-warning text-foreground"
                  )}
                >
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </span>
            <span className="max-w-full truncate px-0.5">{tab}</span>
          </Link>
        )
      })}
    </nav>
  )
}

export function PtShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const pathname = usePathname()
  // Intro-flödet inte klart enligt databasen (äldre token utan flaggan): till onboardingen.
  const blocked = useOnboardingGuard()
  // Den obligatoriska onboardingen (v22/v31) visas utan portalens meny: PT:n kan inte
  // navigera vidare förrän profil, utbetalningar och avtal är klara.
  if (pathname.startsWith(PT_ONBOARDING_PATH) || blocked) {
    return (
      <>
        <div className="app-backdrop" aria-hidden />
        {blocked ? null : children}
      </>
    )
  }
  return (
    <div className="flex min-h-svh">
      <div className="app-backdrop" aria-hidden />
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 border-r border-sidebar-border/70 bg-sidebar/70 pt-[var(--safe-top)] backdrop-blur-xl lg:block">
        <SidebarContent />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-[calc(3.5rem+var(--safe-top))] items-center gap-2 border-b border-border/60 bg-background/70 px-4 pt-[var(--safe-top)] backdrop-blur-xl backdrop-saturate-150 lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Öppna meny">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 gap-0 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Meny</SheetTitle>
              </SheetHeader>
              {/* Plats för stängknappen (44 px) ovanför menyn. */}
              <div className="h-14 shrink-0" aria-hidden />
              <SidebarContent onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <AppMenu suffix="PT" />
          <div className="ml-auto">
            <NotificationBell />
          </div>
        </header>
        {/* Under lg: luft för bottenmenyn (4 rem) + hemindikatorn. */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-[calc(var(--safe-bottom)+5.5rem)] sm:px-6 lg:px-8 lg:pb-[calc(var(--safe-bottom)+1.5rem)]">
          <SyncIndicator className="mb-4" />
          {children}
        </main>
      </div>
      <BottomNav />
      {/* v36: befintliga PT:er som aldrig valt om nyhetsbrev får frågan. */}
      <MarketingPrompt />
    </div>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const { data, actions, me, mode, signOut } = useAppData()
  const trainer = data.trainers.find((t) => t.id === me.id)
  const { unread, pendingRequests } = useNavBadges()

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="hidden h-11 items-center justify-between pl-2 lg:flex">
        <AppMenu suffix="PT" />
        <NotificationBell align="start" />
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
                "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-[background-color,color,transform] duration-150 active:scale-[0.98]",
                active
                  ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
              )}
            >
              {active && <span className="absolute inset-y-2 left-0 w-1 animate-in rounded-full bg-primary fade-in-0 zoom-in-50" aria-hidden />}
              <Icon className="size-4" />
              {label}
              {href === "/pt/kalender" && pendingRequests > 0 && (
                <span
                  className="ml-auto rounded-full bg-warning px-1.5 text-xs font-semibold text-foreground tabular"
                  aria-label={`${pendingRequests} väntande förfrågningar`}
                >
                  {pendingRequests}
                </span>
              )}
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
