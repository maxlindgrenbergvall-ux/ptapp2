"use client"

/**
 * PT:ns koder till befintliga klienter (v19).
 *
 * "Bjud in existerande klient" skapar en engångskod (EX-8FK29A) i databasen
 * (create_pt_invite – bara verifierade PT:er). PT:n skickar koden eller länken
 * i sin egen kanal. När klienten löser in koden kopplas hen direkt till PT:n
 * som befintlig klient och betalar 5 % serviceavgift i stället för 10 %.
 */
import { Check, Copy, KeyRound, Loader2, Share2, Trash2, UserPlus } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BRAND } from "@/lib/brand"
import { useAppData } from "@/lib/data/store"
import { EXISTING_CLIENT_FEE_PERCENT, PLATFORM_FEE_PERCENT } from "@/lib/payments/fees"
import { isInviteExpired, PT_INVITE_DAYS, ptInviteLink } from "@/lib/pt-invites"
import type { PtInvite } from "@/types/domain"

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short" })

/** Knappen i klientöversikten. */
export function InviteExistingClientButton({ className }: { className?: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button className={className} onClick={() => setOpen(true)}>
        <UserPlus /> Bjud in existerande klient
      </Button>
      <InviteDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { actions, me } = useAppData()
  const [label, setLabel] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [invite, setInvite] = React.useState<PtInvite | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setLabel("")
      setInvite(null)
      setError(null)
      setPending(false)
    }
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setPending(true)
    setError(null)
    const res = await actions.createPtInvite(label)
    setPending(false)
    if (res.error || !res.invite) return setError(res.error ?? "Koden kunde inte skapas.")
    setInvite(res.invite)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="pt-invite-dialog">
        <DialogHeader>
          <DialogTitle>Bjud in existerande klient</DialogTitle>
          <DialogDescription>
            För klienter du redan har utanför {BRAND.name}. Med din kod kopplas klienten direkt till dig och betalar {EXISTING_CLIENT_FEE_PERCENT} % serviceavgift i
            stället för {PLATFORM_FEE_PERCENT} %.
          </DialogDescription>
        </DialogHeader>

        {!invite ? (
          <form onSubmit={(e) => void create(e)} className="space-y-4">
            {error && (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="invite-label">Vem är koden till? (valfritt, syns bara för dig)</Label>
              <Input id="invite-label" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="T.ex. Anna S." />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Avbryt
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <KeyRound />} Skapa kod
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <CreatedInvite invite={invite} trainerName={me.name} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Den nya koden: stor, med kopiera och dela. */
function CreatedInvite({ invite, trainerName, onDone }: { invite: PtInvite; trainerName: string; onDone: () => void }) {
  const [copied, setCopied] = React.useState<"code" | "link" | null>(null)
  const link = ptInviteLink(invite.code)
  const message = `Hej! Jag coachar dig nu via ${BRAND.name}. Skapa ett konto med min länk ${link} – eller ange koden ${invite.code} under Inställningar – så kopplas du till mig direkt. /${trainerName}`

  const copy = async (what: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(what === "code" ? invite.code : message)
      setCopied(what)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      toast.error("Kunde inte kopiera – markera och kopiera för hand.")
    }
  }
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: BRAND.name, text: message })
      } catch {
        // Avbrutet av användaren.
      }
      return
    }
    void copy("link")
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 text-center">
        <p className="text-sm text-muted-foreground">{invite.label ? `Kod till ${invite.label}` : "Din kod"}</p>
        <div className="flex items-center gap-2">
          <span
            className="flex-1 rounded-xl border-2 border-dashed border-primary/50 bg-primary/5 px-4 py-3 font-mono text-2xl font-bold tracking-[0.2em]"
            data-testid="pt-invite-code"
          >
            {invite.code}
          </span>
          <Button variant="outline" size="icon" className="size-12" onClick={() => void copy("code")} aria-label="Kopiera koden">
            {copied === "code" ? <Check /> : <Copy />}
          </Button>
        </div>
        <p className="truncate text-xs text-muted-foreground" data-testid="pt-invite-link">
          {link}
        </p>
        <p className="text-xs text-muted-foreground">
          Gäller en gång, i {PT_INVITE_DAYS} dagar (till {formatDate(invite.expiresAt)}).
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button onClick={() => void share()}>
          <Share2 /> Dela
        </Button>
        <Button variant="outline" onClick={() => void copy("link")}>
          {copied === "link" ? <Check /> : <Copy />} {copied === "link" ? "Kopierat" : "Kopiera meddelande"}
        </Button>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Klar
        </Button>
      </DialogFooter>
    </div>
  )
}

/** Mina koder: oanvända, använda och utgångna. */
export function PtInvitesCard() {
  const { data, me, actions } = useAppData()
  const invites = data.ptInvites.filter((i) => i.trainerId === me.id)
  const clientName = (id?: string) => data.clients.find((c) => c.id === id)?.name

  const remove = async (id: string) => {
    const error = await actions.deletePtInvite(id)
    if (error) toast.error(error)
    else toast("Koden är borttagen")
  }

  return (
    <Card data-testid="pt-invites-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" /> Koder till befintliga klienter
        </CardTitle>
        <CardDescription>
          {EXISTING_CLIENT_FEE_PERCENT} % serviceavgift för klienter du bjuder in, {PLATFORM_FEE_PERCENT} % för klienter som hittar dig i appen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <InviteExistingClientButton className="w-full" />
        {invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">Inga koder än.</p>
        ) : (
          <ul className="divide-y rounded-lg border" data-testid="pt-invites-list">
            {invites.map((i) => {
              const expired = isInviteExpired(i)
              return (
                <li key={i.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono font-semibold tracking-wider">{i.code}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {i.isUsed
                        ? `Använd av ${clientName(i.usedBy) ?? "klient"}${i.usedAt ? ` ${formatDate(i.usedAt)}` : ""}`
                        : `${i.label ? `${i.label} · ` : ""}${expired ? "gick ut" : "gäller till"} ${formatDate(i.expiresAt)}`}
                    </span>
                  </span>
                  {i.isUsed ? (
                    <Badge className="border-transparent bg-emerald-600/15 text-emerald-700 dark:text-emerald-400">Använd</Badge>
                  ) : expired ? (
                    <Badge variant="outline">Utgången</Badge>
                  ) : (
                    <Badge variant="outline">Oanvänd</Badge>
                  )}
                  {!i.isUsed && (
                    <Button variant="ghost" size="icon-sm" aria-label={`Ta bort koden ${i.code}`} onClick={() => void remove(i.id)}>
                      <Trash2 />
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/** Märket i klientlistan för klienter som kopplats med PT:ns kod. */
export function ExistingClientBadge() {
  return (
    <Badge variant="outline" className="h-5 px-1.5 text-[10px]" title={`Befintlig klient – ${EXISTING_CLIENT_FEE_PERCENT} % serviceavgift`}>
      Befintlig · {EXISTING_CLIENT_FEE_PERCENT} %
    </Badge>
  )
}
