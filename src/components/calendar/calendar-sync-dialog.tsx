"use client"

import { CalendarSync, Check, Copy, Download, ExternalLink, Loader2, RefreshCw, ShieldAlert } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { BRAND } from "@/lib/brand"
import { buildIcs, icsTitle, subscribeLinks, type IcsEvent } from "@/lib/calendar/ics"
import { useAppData } from "@/lib/data/store"
import { getSupabase } from "@/lib/supabase/client"
import type { AppData, Me } from "@/types/domain"

/**
 * "Synka kalender": prenumerera på passen i Google Calendar, Outlook eller
 * Apple Kalender via en hemlig iCal-länk (uppdateras automatiskt), eller ladda
 * ner en .ics-fil med dagens läge (engångsimport).
 */
export function CalendarSyncButton({ className }: { className?: string }) {
  const { me, mode, data } = useAppData()
  const [open, setOpen] = React.useState(false)
  const [state, setState] = React.useState<{ status: "idle" | "loading" | "ready" | "error"; url?: string }>({ status: "idle" })
  const [copied, setCopied] = React.useState(false)
  const name = `${BRAND.name}-pass`

  const load = React.useCallback(async (rotate = false) => {
    setState({ status: "loading" })
    const { data: token, error } = await getSupabase().rpc("calendar_feed_token", { p_rotate: rotate })
    if (error || typeof token !== "string") return setState({ status: "error" })
    setState({ status: "ready", url: `${window.location.origin}/api/calendar/feed/${token}.ics` })
  }, [])

  const onOpenChange = (o: boolean) => {
    setOpen(o)
    if (o && mode === "supabase" && state.status === "idle") void load()
  }

  const links = state.url ? subscribeLinks(state.url, name) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <CalendarSync /> Synka kalender
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarSync className="size-5 text-primary" /> Synka kalender
          </DialogTitle>
          <DialogDescription>
            Se dina pass i telefonens eller datorns kalender. Nya, flyttade och avbokade pass uppdateras automatiskt.
          </DialogDescription>
        </DialogHeader>

        {mode === "supabase" ? (
          <section className="space-y-3" aria-label="Prenumerera">
            {state.status === "loading" || state.status === "idle" ? (
              <div className="flex justify-center py-6">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : state.status === "error" || !links ? (
              <p className="rounded-lg bg-muted p-3 text-sm">
                Kunde inte skapa kalenderlänken just nu.{" "}
                <button type="button" className="underline underline-offset-4" onClick={() => void load()}>
                  Försök igen
                </button>
              </p>
            ) : (
              <>
                <div className="grid gap-2">
                  <Button asChild className="justify-start">
                    <a href={links.google} target="_blank" rel="noopener noreferrer">
                      <ExternalLink /> Lägg till i Google Kalender
                    </a>
                  </Button>
                  <Button asChild variant="outline" className="justify-start">
                    <a href={links.outlook} target="_blank" rel="noopener noreferrer">
                      <ExternalLink /> Lägg till i Outlook.com
                    </a>
                  </Button>
                  <Button asChild variant="outline" className="justify-start">
                    <a href={links.office365} target="_blank" rel="noopener noreferrer">
                      <ExternalLink /> Lägg till i Outlook (jobb/skola, Microsoft 365)
                    </a>
                  </Button>
                  <Button asChild variant="outline" className="justify-start">
                    <a href={links.apple}>
                      <ExternalLink /> Lägg till i Apple Kalender (iPhone/Mac)
                    </a>
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="feed-url" className="text-xs text-muted-foreground">
                    Eller kopiera länken och lägg till den som &quot;kalender från webben/URL&quot;:
                  </label>
                  <div className="flex gap-2">
                    <Input id="feed-url" readOnly value={state.url} className="h-9 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="secondary"
                      className="size-9"
                      aria-label="Kopiera länken"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(state.url!)
                          setCopied(true)
                          window.setTimeout(() => setCopied(false), 1500)
                        } catch {
                          toast.error("Kunde inte kopiera – markera länken och kopiera manuellt")
                        }
                      }}
                    >
                      {copied ? <Check /> : <Copy />}
                    </Button>
                  </div>
                </div>
                <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Länken är personlig{me.role === "trainer" ? " och visar dina klienters namn och tider" : ""}. Dela den inte. Google och Outlook hämtar
                    ändringar med några timmars mellanrum.{" "}
                    <button
                      type="button"
                      className="underline underline-offset-4 hover:text-foreground"
                      onClick={() => {
                        if (!window.confirm("Skapa en ny länk? Den gamla slutar fungera och måste tas bort i kalenderappen.")) return
                        void load(true).then(() => toast.success("Ny kalenderlänk skapad"))
                      }}
                    >
                      <RefreshCw className="mr-0.5 inline size-3" />
                      Byt länk
                    </button>
                  </span>
                </p>
              </>
            )}
          </section>
        ) : (
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            Demoläge: automatisk synk kräver ett riktigt konto. Du kan ändå ladda ner passen som en .ics-fil nedan.
          </p>
        )}

        <div className="space-y-1.5 border-t pt-3">
          <Button type="button" variant="ghost" className="w-full justify-start" onClick={() => downloadIcs(data, me)}>
            <Download /> Ladda ner .ics-fil (engångsimport)
          </Button>
          <p className="px-1 text-xs text-muted-foreground">Fungerar i alla kalenderappar, men uppdateras inte om passen ändras.</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Passen som en .ics-fil, skapad i webbläsaren från den data användaren redan ser. */
function downloadIcs(data: AppData, me: Me) {
  const since = Date.now() - 30 * 86_400_000
  const nameOf = (id?: string) =>
    (me.role === "trainer" ? data.clients.find((c) => c.id === id)?.name : data.trainers.find((t) => t.id === id)?.name) ?? null
  const events: IcsEvent[] = data.events
    .filter((e) => (me.role === "trainer" ? e.trainerId === me.id : e.clientId === me.id && e.kind === "session"))
    .filter((e) => e.status !== "cancelled" && new Date(e.end).getTime() >= since)
    .map((e) => ({
      id: e.id,
      title: icsTitle({
        kind: e.kind,
        title: e.title,
        status: e.status,
        counterpart: nameOf(me.role === "trainer" ? e.clientId : e.trainerId),
        role: me.role,
      }),
      start: new Date(e.start),
      end: new Date(e.end),
      status: e.status,
      location: e.kind === "block" ? undefined : e.mode === "remote" ? "Distans (videosamtal i Coavira)" : e.location,
    }))
  const blob = new Blob([buildIcs(events, { name: BRAND.name, host: window.location.host })], { type: "text/calendar;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "coavira-pass.ics"
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  toast.success(`${events.length} pass exporterade`, { description: "Öppna filen för att lägga till passen i din kalender." })
}
