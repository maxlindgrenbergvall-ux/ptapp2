"use client"

import { BellRing, ChevronRight, LogOut, Palette, RotateCcw } from "lucide-react"
import Link from "next/link"

import { appMenuLinks } from "@/components/app-menu"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { BRAND } from "@/lib/brand"
import { useAppData } from "@/lib/data/store"
import { useInterests } from "@/lib/offers/interests"

/** Rubrik + kort beskrivning för undersidorna i logomenyn. */
export function SettingsHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  )
}

/** Inställningar: genvägar till undersidorna, erbjudanden, tema och konto. */
export function SettingsPage() {
  const { me, mode, signOut, actions } = useAppData()
  const interests = useInterests(me.id)
  const links = appMenuLinks(me.role).slice(1)
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <SettingsHeader title="Inställningar" description={me.email ? `Inloggad som ${me.email}` : undefined} />
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {links.map(({ href, label, hint, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{label}</span>
                {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>

      {me.role === "client" && (
        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BellRing className="size-4" /> Personliga erbjudanden
            </CardTitle>
            <CardDescription>
              Erbjudanden från PT:er inom det du tittat på. Historiken sparas bara i den här webbläsaren.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={interests.enabled} onCheckedChange={(v) => interests.setEnabled(v === true)} /> Visa personliga erbjudanden
            </label>
          </CardContent>
        </Card>
      )}

      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Palette className="size-4" /> Utseende
          </CardTitle>
          <CardDescription>{BRAND.name} följer telefonens eller datorns ljusa/mörka läge automatiskt.</CardDescription>
        </CardHeader>
      </Card>

      {mode === "demo" ? (
        <Button variant="outline" onClick={actions.resetDemo}>
          <RotateCcw /> Återställ demodatan
        </Button>
      ) : (
        <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => void signOut()}>
          <LogOut /> Logga ut
        </Button>
      )}
    </div>
  )
}
