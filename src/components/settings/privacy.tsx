"use client"

import { Download, ShieldCheck, Trash2 } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RequirePlus } from "@/components/plus/require-plus"
import { exerciseName } from "@/lib/data/selectors"
import { useAppData } from "@/lib/data/store"
import { todayISO } from "@/lib/date"
import { toCsv } from "@/lib/plus"

/** Min data och sekretess: ladda ner all data (GDPR art. 20) eller radera kontot (art. 17). */
export function PrivacySettings() {
  const { data, me, mode, deleteAccount } = useAppData()

  const exportData = () => {
    // Dataportabilitet: allt om användaren i maskinläsbart format.
    const mine = me.role === "client"
    const payload = {
      exportedAt: new Date().toISOString(),
      account: me,
      profile: mine ? data.clients.find((c) => c.id === me.id) : data.trainers.find((t) => t.id === me.id),
      relationships: data.relationships,
      workouts: mine ? data.workouts.filter((w) => w.clientId === me.id) : data.workouts.filter((w) => w.trainerId === me.id),
      nutritionPlans: data.nutritionPlans.filter((p) => (mine ? p.clientId === me.id : p.trainerId === me.id)),
      mealChecks: data.mealChecks.filter((m) => m.clientId === me.id),
      progress: data.progressEntries.filter((e) => e.clientId === me.id),
      messages: data.messages.filter((m) => (mine ? m.threadId === me.id : m.trainerId === me.id)),
      calendar: data.events.filter((e) => (mine ? e.clientId === me.id : e.trainerId === me.id)),
      purchases: data.purchases.filter((p) => (mine ? p.clientId === me.id : p.trainerId === me.id)),
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `coavira-min-data-${todayISO()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Coavira Plus: träning och kost som CSV (bekvämlighetsexport). Exporten ovan
  // av ALL egen data (JSON) är en rättighet enligt GDPR och alltid gratis.
  const trainingRows = () =>
    toCsv(
      ["Datum", "Pass", "Övning", "Set", "Kg", "Reps"],
      data.workouts
        .filter((w) => w.clientId === me.id && w.status === "completed")
        .sort((a, b) => a.date.localeCompare(b.date))
        .flatMap((w) =>
          w.logs
            .filter((l) => l.done)
            .map((l) => {
              const ex = w.exercises.find((e) => e.id === l.workoutExerciseId)
              return [w.date, w.name, ex ? exerciseName(data, ex.exerciseId, me.id) : "", l.setIndex + 1, l.kg, l.reps]
            })
        )
    )
  const foodRows = () =>
    toCsv(
      ["Datum", "Livsmedel", "Mängd", "Enhet", "Kcal", "Protein (g)", "Kolhydrater (g)", "Fett (g)"],
      data.foodEntries
        .filter((f) => f.clientId === me.id)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((f) => [f.date, f.name, f.grams ?? "", f.unit === "ml" ? "ml" : "g", f.kcal, f.protein, f.carbs, f.fat])
    )
  const downloadCsv = (name: string, csv: string) => {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const a = document.createElement("a")
    a.href = url
    a.download = `coavira-${name}-${todayISO()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-primary" /> Vem ser min data?
          </CardTitle>
          <CardDescription>
            {me.role === "client"
              ? "Din träning, vikt, kost och dina mätpunkter delas bara med de PT:er du tränar med just nu. Lämnar du en PT förlorar hen åtkomsten direkt. Chatten med varje PT är privat mellan er två."
              : "Du ser bara data för klienter som aktivt tränar med dig. Chattar och scheman är privata mellan dig och klienten."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/integritet" className="text-sm text-primary underline-offset-4 hover:underline">
            Läs integritetspolicyn
          </Link>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ladda ner min data</CardTitle>
          <CardDescription>All din data i en JSON-fil som du kan spara eller ta med till en annan tjänst.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={exportData}>
            <Download /> Ladda ner (JSON)
          </Button>
        </CardContent>
      </Card>
      {me.role === "client" && (
        <RequirePlus feature="export" title="Exportera träning och kost (CSV)">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Exportera träning och kost</CardTitle>
              <CardDescription>Alla loggade set och all loggad mat som CSV – öppnas direkt i Excel eller Numbers.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => downloadCsv("traning", trainingRows())}>
                <Download /> Träning (CSV)
              </Button>
              <Button variant="outline" onClick={() => downloadCsv("kost", foodRows())}>
                <Download /> Kost (CSV)
              </Button>
            </CardContent>
          </Card>
        </RequirePlus>
      )}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base">Radera kontot</CardTitle>
          <CardDescription>Allt raderas permanent och kan inte återställas.</CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "supabase" ? (
            <DeleteAccountDialog onConfirm={deleteAccount} />
          ) : (
            <p className="text-sm text-muted-foreground">Demoläge: kontoradering finns när appen är kopplad till Supabase.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function DeleteAccountDialog({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const [open, setOpen] = React.useState(false)
  const [text, setText] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const CONFIRM = "RADERA"
  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), setText(""))}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-destructive hover:text-destructive">
          <Trash2 /> Radera mitt konto
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Radera kontot permanent?</DialogTitle>
          <DialogDescription>
            All din data raderas direkt och kan inte återställas: pass, loggar, vikt, kost, meddelanden och bokningar.
            Ladda gärna ner din data först.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="confirm-delete">Skriv {CONFIRM} för att bekräfta</Label>
          <Input id="confirm-delete" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={text !== CONFIRM || pending}
            onClick={async () => {
              setPending(true)
              await onConfirm()
              setPending(false)
            }}
          >
            {pending ? "Raderar…" : "Radera allt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

