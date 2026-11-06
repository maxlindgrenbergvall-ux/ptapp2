"use client"

import { BookOpen, ChefHat } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

/** Kost-fliken (v42): kostdagboken och recepten som två sidor med en gemensam växel överst. */
export function KostTabs() {
  const pathname = usePathname()
  const tabs = [
    { href: "/klient/kost", label: "Dagbok", icon: BookOpen },
    { href: "/klient/recept", label: "Recept", icon: ChefHat },
  ]
  return (
    <nav className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" aria-label="Kost" data-testid="kost-tabs">
      {tabs.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-10 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors",
              active ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-4" /> {label}
          </Link>
        )
      })}
    </nav>
  )
}
