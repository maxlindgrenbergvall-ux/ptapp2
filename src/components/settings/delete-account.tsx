"use client"

/**
 * "Radera mitt konto" – krävs av Apple (5.1.1(v)) och Google Play och är en
 * rättighet enligt GDPR (art. 17). Finns i Inställningar, i
 * Profilinställningar och under Min data och sekretess, för klienter och PT:er.
 *
 * Raderingen görs av servern (/api/account/delete): filer i Storage tas bort
 * och kontot raderas med Supabase Auth admin-API:t. Databasen raderar resten
 * och avidentifierar det andra behåller.
 */
import { Loader2, Trash2 } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DELETE_CONFIRM_WORD } from "@/lib/account"
import { useAppData } from "@/lib/data/store"

export function DeleteAccountCard({ showExportLink = true }: { showExportLink?: boolean }) {
  const { me } = useAppData()
  const base = me.role === "trainer" ? "/pt" : "/klient"
  return (
    <Card className="gap-3 border-destructive/30" data-testid="delete-account-card">
      <CardHeader>
        <CardTitle className="text-base">Radera kontot</CardTitle>
        <CardDescription>
          Kontot och all din data raderas permanent och kan inte återställas.
          {showExportLink && (
            <>
              {" "}
              <Link href={`${base}/sekretess`} className="underline underline-offset-4">
                Ladda ner din data
              </Link>{" "}
              först om du vill spara den.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DeleteAccountButton />
      </CardContent>
    </Card>
  )
}

export function DeleteAccountButton() {
  const { me, mode, deleteAccount } = useAppData()
  const [open, setOpen] = React.useState(false)
  const [text, setText] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const trainer = me.role === "trainer"
  const confirmed = text.trim().toUpperCase() === DELETE_CONFIRM_WORD

  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), setText(""))}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-destructive hover:text-destructive">
          <Trash2 /> Radera mitt konto
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="delete-account-dialog">
        <DialogHeader>
          <DialogTitle>Radera kontot permanent?</DialogTitle>
          <DialogDescription>
            {trainer
              ? "Din PT-profil, dina tjänster, program, kostscheman, koder och meddelanden raderas direkt. Dina klienter kan inte längre boka dig."
              : "All din data raderas direkt: pass, loggar, vikt, kost, sömn, meddelanden, bokningar, köp och varukorg."}{" "}
            Det kan inte ångras. Inga abonnemang förnyas – du debiteras inget mer.
          </DialogDescription>
        </DialogHeader>
        {mode === "demo" && (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Demoläge: inget riktigt konto raderas – demodatan börjar om.</p>
        )}
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!confirmed) return
            setPending(true)
            await deleteAccount()
            setPending(false)
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="confirm-delete">Skriv {DELETE_CONFIRM_WORD} för att bekräfta</Label>
            <Input id="confirm-delete" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" autoCapitalize="characters" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Avbryt
            </Button>
            <Button type="submit" variant="destructive" disabled={!confirmed || pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Trash2 />} {pending ? "Raderar…" : "Radera kontot"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
