"use client"

import { BellRing, LogOut, Palette, RotateCcw, Timer } from "lucide-react"

import { appMenuLinks } from "@/components/app-menu"
import { LegalLinksCard } from "@/components/legal-links"
import { PushSettingsCard } from "@/components/native/push-settings"
import { DeleteAccountCard } from "@/components/settings/delete-account"
import { MarketingConsentRow } from "@/components/settings/marketing-consent"
import { SettingsGroup, SettingsLinkRow, SettingsToggleRow } from "@/components/settings/settings-list"
import { PtInviteRedeemCard } from "@/components/pt/pt-invite-redeem"
import { Button } from "@/components/ui/button"
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
    <div className="mx-auto max-w-2xl space-y-4 sm:space-y-5">
      <SettingsHeader title="Inställningar" description={me.email ? `Inloggad som ${me.email}` : undefined} />
      <SettingsGroup>
        {links.map(({ href, label, hint, icon }) => (
          <SettingsLinkRow key={href} href={href} icon={icon} label={label} hint={hint} />
        ))}
        {/* v37: träningsinställningarna (vilotid m.m.) bor i profilen. */}
        {me.role === "client" && <SettingsLinkRow href="/klient/profil#traning" icon={Timer} label="Träning" hint="Vilotid mellan set, hälsosynk och scheman" />}
      </SettingsGroup>

      {me.role === "client" && <PtInviteRedeemCard />}

      <SettingsGroup title="Preferenser">
        {me.role === "client" && (
          <SettingsToggleRow
            id="offers-enabled"
            icon={BellRing}
            label="Visa personliga erbjudanden"
            hint="Från PT:er inom det du tittat på (sparas i webbläsaren)"
            checked={interests.enabled}
            onCheckedChange={interests.setEnabled}
          />
        )}
        <MarketingConsentRow />
      </SettingsGroup>

      <PushSettingsCard />

      <LegalLinksCard />
      <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
        <Palette className="size-3.5" /> Utseende: {BRAND.name} följer telefonens eller datorns ljusa/mörka läge automatiskt.
      </p>

      {mode === "demo" ? (
        <Button variant="outline" onClick={actions.resetDemo}>
          <RotateCcw /> Återställ demodatan
        </Button>
      ) : (
        <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => void signOut()}>
          <LogOut /> Logga ut
        </Button>
      )}

      <DeleteAccountCard />
    </div>
  )
}
