"use client"

import { Flag, HeartPulse, LogOut, ShieldX, Users } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"

import { BrandMark } from "@/components/brand"
import { BRAND } from "@/lib/brand"

/**
 * Adminskalet (v47): alltid Coaviras mörka palett, oavsett systemtema.
 * Klassen sätts även på <html> medan skalet visas, så att dialoger och
 * sidopaneler (som ritas utanför skalet) får samma färger.
 */
/** Coaviras mörka palett på hela sidan (även dialoger som ritas utanför skalet). */
export function useAdminDark() {
  React.useEffect(() => {
    document.documentElement.classList.add("admin-dark")
    return () => document.documentElement.classList.remove("admin-dark")
  }, [])
}

export function AdminShell({ demo, children }: { demo: boolean; children: React.ReactNode }) {
  useAdminDark()
  const pathname = usePathname()
  return (
    <div className="admin-dark min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/95 pt-[var(--safe-top)]">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
          <Link href="/admin/leads" className="flex items-center gap-2.5 rounded-lg font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <BrandMark size="sm" />
            {BRAND.name}
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Admin</span>
          </Link>
          <nav aria-label="Admin" className="ml-2 flex items-center gap-1 text-sm">
            {[
              { href: "/admin/leads", label: "Leads", Icon: Users },
              { href: "/admin/moderering", label: "Moderering", Icon: Flag },
              { href: "/admin/friskvard", label: "Friskvård", Icon: HeartPulse },
            ].map(({ href, label, Icon }) => {
              const on = pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={on ? "page" : undefined}
                  className={on ? "flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 font-medium text-primary" : "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-muted-foreground hover:text-foreground"}
                >
                  <Icon className="size-4" /> {label}
                </Link>
              )
            })}
          </nav>
          {demo && (
            <span className="ml-auto rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning" data-testid="crm-demo">
              Demoläge – påhittad data
            </span>
          )}
        </div>
      </header>
      <main className="page-enter mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  )
}

/**
 * Inloggad men inte administratör – bara på CRM-driftsättningen (i appen svarar
 * /admin 404, så att panelen inte syns alls).
 */
export function NoAccess() {
  useAdminDark()
  return (
    <main className="admin-dark flex min-h-svh items-center justify-center bg-background p-6 text-foreground">
      <div className="rise-in max-w-sm space-y-4 text-center" data-testid="crm-no-access">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ShieldX className="size-5" />
        </span>
        <h1 className="text-xl font-semibold">Kontot har inte behörighet</h1>
        <p className="text-sm text-muted-foreground">Det här kontot är inte administratör. Logga in med ett annat konto, eller be någon med åtkomst att lägga till dig.</p>
        <form action="/auth/signout" method="post">
          <button type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium transition-colors hover:bg-muted">
            <LogOut className="size-4" /> Logga ut
          </button>
        </form>
      </div>
    </main>
  )
}
