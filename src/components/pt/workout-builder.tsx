"use client"

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Copy, Dumbbell, GripVertical, Loader2, Plus, Save, Search, Send, Trash2, Upload, Video } from "lucide-react"
import * as React from "react"
import { sv } from "react-day-picker/locale"
import { toast } from "sonner"

import { EmptyState, PageHeader } from "@/components/common"
import { VideoEmbed } from "@/components/video-embed"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { NumberInput } from "@/components/ui/number-input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { sessionBalance } from "@/lib/services/balance"
import { useAppData } from "@/lib/data/store"
import { formatShort, parseISODate, toISODate, todayISO } from "@/lib/date"
import { ACCEPT, safeName, uploadFile } from "@/lib/storage"
import { cn } from "@/lib/utils"
import { parseVideo } from "@/lib/video"
import type { Exercise, MuscleGroup, WorkoutExercise, WorkoutTemplate } from "@/types/domain"

const MUSCLE_GROUPS: MuscleGroup[] = ["ben", "bröst", "rygg", "axlar", "armar", "bål", "helkropp", "kondition"]

export function WorkoutBuilder() {
  const { data, actions, me } = useAppData()
  const templates = data.templates.filter((t) => t.trainerId === me.id)
  const [selectedId, setSelectedId] = React.useState<string | null>(templates[0]?.id ?? null)
  const [draft, setDraft] = React.useState<WorkoutTemplate | null>(() => templates[0] ?? null)
  const saved = templates.find((t) => t.id === draft?.id)
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved)

  const select = (tpl: WorkoutTemplate) => {
    if (dirty && !window.confirm("Du har osparade ändringar. Byta mall ändå?")) return
    setSelectedId(tpl.id)
    setDraft(tpl)
  }

  const createNew = () => {
    if (dirty && !window.confirm("Du har osparade ändringar. Skapa ny mall ändå?")) return
    const tpl: WorkoutTemplate = {
      id: actions.newId(),
      trainerId: me.id,
      name: "Nytt pass",
      description: "",
      exercises: [],
    }
    setSelectedId(tpl.id)
    setDraft(tpl)
  }

  const save = () => {
    if (!draft) return
    if (!draft.name.trim()) return toast.error("Passet behöver ett namn")
    actions.saveTemplate({ ...draft, name: draft.name.trim() })
    toast.success("Mallen är sparad")
  }

  const addExercise = (exercise: Exercise) => {
    if (!draft) return
    const entry: WorkoutExercise = {
      id: actions.newId(),
      exerciseId: exercise.id,
      sets: 3,
      reps: exercise.muscleGroup === "kondition" ? "500 m" : "10",
      restSec: 90,
    }
    setDraft({ ...draft, exercises: [...draft.exercises, entry] })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Passbyggare"
        description="Bygg mallar, dra för att ändra ordning och tilldela dem till klienter."
        actions={
          <Button variant="outline" onClick={createNew}>
            <Plus /> Ny mall
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[220px_1fr] xl:grid-cols-[220px_1fr_300px]">
        {/* Mallar */}
        <nav aria-label="Passmallar" className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => select(t)}
              className={cn(
                "shrink-0 rounded-lg border px-3 py-2 text-left text-sm transition-colors lg:w-full",
                selectedId === t.id ? "border-foreground/40 bg-muted font-medium" : "hover:bg-muted/60"
              )}
            >
              {t.name}
              <span className="block text-xs font-normal text-muted-foreground">{t.exercises.length} övningar</span>
            </button>
          ))}
          {draft && !saved && (
            <div className="shrink-0 rounded-lg border border-dashed px-3 py-2 text-sm lg:w-full">
              {draft.name || "Namnlös"} <span className="block text-xs text-muted-foreground">Ej sparad</span>
            </div>
          )}
        </nav>

        {/* Byggaren */}
        {draft ? (
          <Card className="min-w-0">
            <CardHeader className="gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="h-10 max-w-sm text-base font-semibold"
                  aria-label="Passets namn"
                />
                {dirty && <Badge variant="outline">Osparat</Badge>}
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Duplicera mall"
                    onClick={() => {
                      const copy = { ...draft, id: actions.newId(), name: `${draft.name} (kopia)` }
                      actions.saveTemplate(copy)
                      setSelectedId(copy.id)
                      setDraft(copy)
                    }}
                  >
                    <Copy />
                  </Button>
                  {saved && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Ta bort mall"
                      onClick={() => {
                        if (!window.confirm(`Ta bort "${saved.name}"? Redan schemalagda pass påverkas inte.`)) return
                        actions.deleteTemplate(saved.id)
                        const next = templates.find((t) => t.id !== saved.id) ?? null
                        setSelectedId(next?.id ?? null)
                        setDraft(next)
                      }}
                    >
                      <Trash2 />
                    </Button>
                  )}
                  <AssignDialog template={saved} disabled={dirty || !saved} />
                  <Button onClick={save} disabled={!dirty}>
                    <Save /> Spara
                  </Button>
                </div>
              </div>
              <Textarea
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="Beskrivning / syfte med passet"
                rows={2}
                aria-label="Beskrivning"
              />
            </CardHeader>
            <CardContent className="space-y-3">
              <SortableExercises
                items={draft.exercises}
                onChange={(exercises) => setDraft({ ...draft, exercises })}
              />
              {draft.exercises.length === 0 && (
                <EmptyState icon={Dumbbell} title="Inga övningar än" text="Sök i övningsbanken och klicka för att lägga till." />
              )}
              <div className="xl:hidden">
                <ExerciseLibrary onAdd={addExercise} compact />
              </div>
            </CardContent>
          </Card>
        ) : (
          <EmptyState icon={Dumbbell} title="Ingen mall vald" text="Skapa en ny mall för att komma igång." />
        )}

        {/* Övningsbank (desktop) */}
        <div className="hidden xl:block">
          <ExerciseLibrary onAdd={addExercise} disabled={!draft} />
        </div>
      </div>
    </div>
  )
}

function SortableExercises({
  items,
  onChange,
}: {
  items: WorkoutExercise[]
  onChange: (items: WorkoutExercise[]) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = items.findIndex((i) => i.id === active.id)
    const to = items.findIndex((i) => i.id === over.id)
    onChange(arrayMove(items, from, to))
  }
  const update = (id: string, patch: Partial<WorkoutExercise>) =>
    onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)))

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ol className="space-y-2">
          {items.map((item, index) => (
            <SortableExerciseRow
              key={item.id}
              index={index}
              item={item}
              onUpdate={(patch) => update(item.id, patch)}
              onRemove={() => onChange(items.filter((i) => i.id !== item.id))}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  )
}

function SortableExerciseRow({
  item,
  index,
  onUpdate,
  onRemove,
}: {
  item: WorkoutExercise
  index: number
  onUpdate: (patch: Partial<WorkoutExercise>) => void
  onRemove: () => void
}) {
  const { data } = useAppData()
  const exercise = data.exercises.find((e) => e.id === item.exerciseId)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const [showNotes, setShowNotes] = React.useState(Boolean(item.notes || item.videoUrl))

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("rounded-lg border bg-card p-3", isDragging && "relative z-10 shadow-lg ring-2 ring-ring/40")}
    >
      <div className="flex items-start gap-2">
        <button
          className="mt-1.5 cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
          aria-label={`Flytta ${exercise?.name}. Använd mellanslag och piltangenter.`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground tabular">{index + 1}.</span>
            <span className="truncate font-medium">{exercise?.name ?? "Okänd övning"}</span>
            <Badge variant="secondary" className="hidden capitalize sm:inline-flex">
              {exercise?.muscleGroup}
            </Badge>
            <div className="ml-auto flex">
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={showNotes}
                aria-label={item.videoUrl ? "Anteckningar och video (video tillagd)" : "Lägg till anteckningar och video"}
                onClick={() => setShowNotes((s) => !s)}
                className={cn("h-8 px-2", item.videoUrl ? "text-primary" : "text-muted-foreground")}
              >
                <Video /> <span className="hidden text-xs sm:inline">{item.videoUrl ? "Video" : "Video/notis"}</span>
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Ta bort övning" onClick={onRemove}>
                <Trash2 />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            <Field label="Set">
              <NumberInput min={1} max={20} value={item.sets} onValueChange={(v) => v !== undefined && onUpdate({ sets: Math.min(20, Math.max(1, v)) })} />
            </Field>
            <Field label="Reps">
              <Input value={item.reps} onChange={(e) => onUpdate({ reps: e.target.value })} />
            </Field>
            <Field label="Kg">
              <NumberInput decimal min={0} max={1000} value={item.targetKg} onValueChange={(v) => onUpdate({ targetKg: v })} />
            </Field>
            <Field label="Vila (s)">
              <NumberInput min={0} max={900} value={item.restSec} onValueChange={(v) => onUpdate({ restSec: v ?? 0 })} />
            </Field>
            <Field label="RPE">
              <NumberInput decimal min={1} max={10} value={item.rpe} onValueChange={(v) => onUpdate({ rpe: v })} />
            </Field>
          </div>
          {showNotes && (
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 [&>*]:min-w-0">
              <Textarea
                placeholder="Instruktioner till klienten"
                rows={3}
                value={item.notes ?? ""}
                onChange={(e) => onUpdate({ notes: e.target.value || undefined })}
                aria-label={`Instruktioner för ${exercise?.name}`}
              />
              <ExerciseVideoField
                value={item.videoUrl}
                title={exercise?.name ?? "Övning"}
                onChange={(videoUrl) => onUpdate({ videoUrl })}
              />
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="block text-[11px] text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function ExerciseLibrary({ onAdd, disabled, compact }: { onAdd: (e: Exercise) => void; disabled?: boolean; compact?: boolean }) {
  const { data } = useAppData()
  const [q, setQ] = React.useState("")
  const [group, setGroup] = React.useState<MuscleGroup | null>(null)
  const results = data.exercises.filter(
    (e) =>
      (!group || e.muscleGroup === group) &&
      (e.name.toLowerCase().includes(q.trim().toLowerCase()) || e.equipment.toLowerCase().includes(q.trim().toLowerCase()))
  )

  const list = (
    <ul className="space-y-1 pr-3">
      {results.map((e) => (
        <li key={e.id}>
          <button
            disabled={disabled}
            onClick={() => onAdd(e)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
          >
            <Plus className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{e.name}</span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">{e.equipment}</span>
          </button>
        </li>
      ))}
      {results.length === 0 && <li className="px-2 py-4 text-center text-sm text-muted-foreground">Inga träffar.</li>}
    </ul>
  )

  return (
    <Card className={cn("gap-3", compact && "border-dashed shadow-none")}>
      <CardHeader className="gap-3">
        <CardTitle className="text-base">Övningsbank</CardTitle>
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök övning eller utrustning" className="pl-8" aria-label="Sök övning" />
        </div>
        <div className="flex flex-wrap gap-1">
          {MUSCLE_GROUPS.map((g) => (
            <button
              key={g}
              onClick={() => setGroup(group === g ? null : g)}
              aria-pressed={group === g}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs capitalize transition-colors",
                group === g ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
            >
              {g}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>{compact ? <div className="max-h-64 overflow-y-auto">{list}</div> : <ScrollArea className="h-[28rem]">{list}</ScrollArea>}</CardContent>
    </Card>
  )
}

function AssignDialog({ template, disabled }: { template?: WorkoutTemplate; disabled: boolean }) {
  const { data, actions, me } = useAppData()
  const clients = data.clients.filter((c) => c.trainerId === me.id && c.status === "active")
  const [open, setOpen] = React.useState(false)
  const [clientId, setClientId] = React.useState(clients[0]?.id ?? "")
  const [dates, setDates] = React.useState<Date[]>([])

  const balance = clientId ? sessionBalance(data, me.id, clientId) : null
  const tooMany = balance !== null && dates.length > balance.remaining

  const submit = () => {
    if (!template || !clientId || dates.length === 0) return
    // Aldrig fler pass än klienten har betalat för.
    if (tooMany) return toast.error(`Klienten har bara ${balance?.remaining ?? 0} betalda pass kvar.`)
    for (const d of dates) {
      const error = actions.scheduleWorkout(clientId, template, toISODate(d))
      if (error) return toast.error(error)
    }
    const name = clients.find((c) => c.id === clientId)?.name
    toast.success(`${template.name} tilldelat ${name}`, {
      description: dates.map((d) => formatShort(toISODate(d))).join(", "),
    })
    setDates([])
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled} title={disabled ? "Spara mallen först" : undefined}>
          <Send /> Tilldela
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tilldela &quot;{template?.name}&quot;</DialogTitle>
          <DialogDescription>Välj klient och en eller flera dagar.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Klient</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Välj klient" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {balance && (
            <p className={cn("rounded-lg px-3 py-2 text-sm", tooMany || balance.remaining < 1 ? "bg-destructive/10 text-destructive" : "bg-muted")}>
              {balance.remaining} av {balance.paid} betalda pass kvar
              {tooMany ? ` – välj högst ${balance.remaining} ${balance.remaining === 1 ? "dag" : "dagar"}.` : "."}
            </p>
          )}
          <div className="flex justify-center rounded-md border">
            <Calendar
              mode="multiple"
              selected={dates}
              onSelect={(d) => setDates(d ?? [])}
              locale={sv}
              disabled={{ before: parseISODate(todayISO()) }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={!clientId || dates.length === 0 || tooMany}>
            Tilldela {dates.length > 0 && `(${dates.length} pass)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Instruktionsvideo per övning: YouTube-/Vimeo-länk eller egen uppladdad fil. */
function ExerciseVideoField({
  value,
  title,
  onChange,
}: {
  value?: string
  title: string
  onChange: (v: string | undefined) => void
}) {
  const { me } = useAppData()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const [link, setLink] = React.useState("")

  const upload = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      onChange(await uploadFile("exercise-videos", `${me.id}/${crypto.randomUUID()}-${safeName(file.name)}`, file))
      toast.success("Videon är uppladdad")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Uppladdningen misslyckades")
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  if (value) {
    return (
      <div className="space-y-1.5">
        <VideoEmbed source={value} title={`Instruktionsvideo: ${title}`} />
        <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => onChange(undefined)}>
          <Trash2 /> Ta bort video
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const v = link.trim()
          if (!parseVideo(v)) return toast.error("Klistra in en länk till YouTube, Vimeo eller en videofil (.mp4)")
          onChange(v)
          setLink("")
        }}
      >
        <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="YouTube- eller Vimeo-länk" aria-label="Videolänk" className="h-8 text-sm" />
        <Button type="submit" size="sm" variant="outline" disabled={!link.trim()}>
          Lägg till
        </Button>
      </form>
      <input ref={inputRef} type="file" accept={ACCEPT["exercise-videos"]} className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
      <Button type="button" variant="ghost" size="sm" className="h-auto min-h-8 w-full py-1.5 whitespace-normal text-muted-foreground" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="animate-spin" /> : <Upload />} {busy ? "Laddar upp…" : "eller ladda upp en video (max 200 MB)"}
      </Button>
    </div>
  )
}
