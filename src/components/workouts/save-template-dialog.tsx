"use client"

import { BookmarkPlus } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAppData } from "@/lib/data/store"
import { buildTemplate, myTemplates, TEMPLATE_NAME_MAX, templateNamed } from "@/lib/templates"
import { cn } from "@/lib/utils"
import type { WorkoutExercise, WorkoutTemplate } from "@/types/domain"

/**
 * "Spara som mall": ge passet ett namn och spara det bland mina mallar.
 * Används i passbyggaren (PT), i eget pass (klient) och i passvyn för
 * genomförda pass. Finns redan en mall med samma namn kan den ersättas.
 *
 * `getExercises` anropas först när man trycker Spara, så att utkast kan
 * valideras (returnera null = avbryt, felet visas av anroparen).
 */
export function SaveAsTemplateDialog({
  defaultName,
  description,
  getExercises,
  onSaved,
  disabled,
  className,
  size = "default",
  label = "Spara som mall",
}: {
  defaultName: string
  description?: string
  getExercises: () => WorkoutExercise[] | null
  onSaved?: (template: WorkoutTemplate) => void
  disabled?: boolean
  className?: string
  size?: "default" | "sm"
  label?: string
}) {
  const { data, actions, me } = useAppData()
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState(defaultName)
  const existing = templateNamed(myTemplates(data, me.id), name)
  const trimmed = name.trim()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    // Dialogen kan ligga i ett annat formulär (eget pass): React-händelser bubblar
    // genom portalen, så stoppa submit från att även skicka det yttre formuläret.
    e.stopPropagation()
    if (!trimmed) return toast.error("Ge mallen ett namn")
    const exercises = getExercises()
    if (!exercises) return
    if (!exercises.length) return toast.error("Mallen behöver minst en övning")
    const template = buildTemplate({ ownerId: me.id, name: trimmed, description, exercises, newId: actions.newId, replace: existing })
    actions.saveTemplate(template)
    setOpen(false)
    toast.success(existing ? "Mallen är uppdaterad" : "Sparad som mall", { description: `"${template.name}" finns nu bland dina mallar.` })
    onSaved?.(template)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), o && setName(defaultName))}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size={size} disabled={disabled} className={cn(className)} data-testid="save-as-template">
          <BookmarkPlus /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Spara som mall</DialogTitle>
            <DialogDescription>Mallen sparar övningar, set, reps, vila och startvikter. Läs in den när du skapar ett nytt pass.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="template-name">Mallens namn</Label>
            <Input
              id="template-name"
              value={name}
              maxLength={TEMPLATE_NAME_MAX}
              autoFocus
              enterKeyHint="done"
              onChange={(e) => setName(e.target.value)}
              placeholder="T.ex. Överkropp A"
              aria-invalid={!trimmed || undefined}
            />
            {existing && (
              <p className="text-xs text-muted-foreground" data-testid="template-exists">
                Du har redan en mall som heter &quot;{existing.name}&quot; – den ersätts.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={!trimmed} data-testid="save-template-confirm">
              {existing ? "Ersätt mallen" : "Spara mall"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
