"use client"

import { Users } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { BrandMark } from "@/components/brand"
import { BRAND } from "@/lib/brand"

/**
 * Adminskalet (v47): alltid Coaviras mörka palett, oavsett systemtema.
 * Klassen sätts även på <html> medan skalet visas, så att dialoger och
 * sidopaneler (som ritas utanför skalet) får samma färger.
 */
export function AdminShell({ demo, children }: { demo: boolean; children: React.ReactNode }) {
  React.useEffect(() => {
    document.documentElement.classList.add("admin-dark")
    return () => document.documentElement.classList.remove("admin-dark")
  }, [])
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
            <span aria-current="page" className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 font-medium text-primary">
              <Users className="size-4" /> Leads
            </span>
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
