"use client"

import { ChevronDown, Home, LogOut, Plug, RotateCcw, Settings, ShieldCheck, UserRound } from "lucide-react"
import Link from "next/link"

import { BrandMark } from "@/components/brand"
import { PersonAvatar } from "@/components/common"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { BRAND } from "@/lib/brand"
import { useAppData } from "@/lib/data/store"
import { cn } from "@/lib/utils"

/** Länkarna i logomenyn. Samma struktur för klient och PT. */
export function appMenuLinks(role: "client" | "trainer") {
  const base = role === "trainer" ? "/pt" : "/klient"
  return [
    { href: `${base}/installningar`, label: "Inställningar", icon: Settings },
    {
      href: `${base}/profil`,
      label: "Profilinställningar",
      hint: role === "trainer" ? "Profil, utbud och tjänster" : "Intressen, mål och personuppgifter",
      icon: UserRound,
    },
    { href: `${base}/sekretess`, label: "Min data och sekretess", icon: ShieldCheck },
    {
      href: `${base}/anslutningar`,
      label: "Anslutningar",
      hint: role === "trainer" ? "Kalendersynk" : "Wearables och kalender",
      icon: Plug,
    },
  ]
}

/**
 * Logomenyn: Coavira-loggan uppe till vänster öppnar en meny med inställningar,
 * profil, sekretess och anslutningar (i stället för att bara leda till startsidan).
 */
export function AppMenu({ suffix, className }: { suffix?: string; className?: string }) {
  const { me, mode, signOut, actions, data } = useAppData()
  const avatar = me.role === "trainer" ? data.trainers.find((t) => t.id === me.id)?.avatarUrl : undefined
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "-ml-1.5 flex items-center gap-2 rounded-lg px-1.5 py-1 font-semibold tracking-tight outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-muted",
          className
        )}
        aria-label={`${BRAND.name}-menyn`}
      >
        <BrandMark size="sm" />
        {BRAND.name}
        {suffix && <span className="text-xs font-normal text-muted-foreground">{suffix}</span>}
        <ChevronDown className="size-4 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="w-64">
        <DropdownMenuLabel className="flex items-center gap-2.5 py-2 font-normal">
          <PersonAvatar name={me.name} src={avatar} className="size-8" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{me.name || "Mitt konto"}</span>
            <span className="block truncate text-xs text-muted-foreground">{me.email ?? (me.role === "trainer" ? "Personlig tränare" : "Klient")}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={me.role === "trainer" ? "/pt" : "/klient"}>
            <Home /> Startsidan
          </Link>
        </DropdownMenuItem>
        {appMenuLinks(me.role).map(({ href, label, hint, icon: Icon }) => (
          <DropdownMenuItem key={href} asChild>
            <Link href={href} className="items-start">
              <Icon className="mt-0.5" />
              <span className="min-w-0">
                <span className="block">{label}</span>
                {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
              </span>
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {mode === "demo" ? (
          <DropdownMenuItem onSelect={actions.resetDemo}>
            <RotateCcw /> Återställ demo
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem variant="destructive" onSelect={() => void signOut()}>
            <LogOut /> Logga ut
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
