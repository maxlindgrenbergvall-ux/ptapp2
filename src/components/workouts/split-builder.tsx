"use client"

/**
 * Passbyggaren (v59) – EN komponent för både klient och PT.
 *
 *   Klient:  /klient/schema  ("Upplägg / Tips")   <SplitBuilder mode="client" />
 *   PT:      /pt/pass        ("Passbyggare")      <SplitBuilder mode="trainer" />
 *
 * Själva byggaren är identisk för rollerna: färdiga upplägg med filtret
 * Alla/Styrka/Löpning/Hyrox, Mina mallar, eget upplägg, dagar och flyttbara
 * vilodagar med drag-and-drop, övningar med adaptiva fält per träningsform,
 * block/varv, egna övningar, "Mer" (del av passet, vila, RPE, reps per set,
 * instruktioner, video) och antal dagar per vecka – utan startdatum.
 *
 * Det enda som skiljer är vad som händer när man är klar (längst ned):
 *   Klient  "Använd upplägget" – blir det aktiva schemat (Nästa pass).
 *   PT      Tilldela till klient (en eller flera aktiva klienter) eller Spara som PT-mall.
 */
import { ArrowLeft, ArrowRight, Check, LayoutTemplate, Link2, Moon, PencilLine, Play, Plus, RefreshCw, SlidersHorizontal, Trash2, Unlink, UserRoundCheck, Users } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { confirmDialog } from "@/components/ui/confirm"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { CustomExerciseDialog } from "@/components/exercises/custom-exercise-dialog"
import { ExercisePickerDialog } from "@/components/exercises/exercise-picker"
import { PersonAvatar } from "@/components/common"
import { AdaptiveFields, CategoryPills } from "@/components/workouts/adaptive-fields"
import { ExerciseVideoField, SetRepsEditor } from "@/components/workouts/exercise-extras"
import { SortableList } from "@/components/workouts/sortable-list"
import { MAX_SPLIT_DAYS, suggestedDaysPerWeek, withRestDays } from "@/lib/active-split"
import { useAppData } from "@/lib/data/store"
import { toKg } from "@/lib/exercises/custom"
import { MAX_REST_SEC } from "@/lib/exercises/draft"
import { useT } from "@/lib/i18n/provider"
import { hasMessage } from "@/lib/i18n/translate"
import { cloneSplit, customSplit, type Split, type SplitDay, type SplitExercise, splitCategories, SPLITS } from "@/lib/splits"
import { buildTemplate, myTemplates } from "@/lib/templates"
import { blocks, defaultCategory, exerciseNameIn, favouredCategories, linkToPrevious, newExerciseEntry, type PlanCategory, setBlockRounds, unlink } from "@/lib/training-modes"
import { cn } from "@/lib/utils"
import { SECTION_LABEL, sectionOf, sortBySection, WORKOUT_SECTIONS } from "@/lib/workout-rules"
import type { Exercise, ID, WorkoutSection, WorkoutTemplate } from "@/types/domain"

/**
 * I editorn har varje övning ett id (för drag-and-drop); det tas bort när
 * upplägget sparas. Sifferfälten får vara tomma ("") medan man skriver – de
 * faller aldrig tillbaka på 1 och kontrolleras först när man sparar.
 */
type EditExercise = Omit<SplitExercise, "sets" | "restSec"> & { id: string; sets: number | undefined; restSec: number | undefined }
type EditDay = Omit<SplitDay, "exercises"> & { id: string; exercises: EditExercise[]; /** Öppnad från en sparad mall – sparas tillbaka till den. */ templateId?: ID }
type EditSplit = Omit<Split, "days"> & { days: EditDay[] }

const stripId = (e: EditExercise): SplitExercise => {
  const copy: Partial<EditExercise> = { ...e }
  delete copy.id
  return { ...(copy as Omit<EditExercise, "id">), sets: e.sets ?? 0, restSec: e.restSec ?? 0 }
}

/** Övningar med tomma obligatoriska fält (måste fyllas i innan upplägget sparas). */
export const incompleteExercises = (s: Pick<EditSplit, "days">) =>
  s.days.flatMap((d) =>
    d.exercises.filter((e) => {
      if (!e.sets || e.sets < 1) return true
      // v58: löpning behöver distans (och vila), kondition distans eller reps, styrka reps (och vila).
      const type = e.trackingType ?? "strength"
      if (type === "running") return (!e.distanceM && !e.durationSec) || e.restSec === undefined
      if (type === "conditioning") return !e.distanceM && !e.reps.trim()
      return !e.reps.trim() || e.restSec === undefined
    })
  )

const toPlain = (s: EditSplit) => ({
  ...s,
  // Uppvärmning först, nedvarvning sist – ordningen inom varje del behålls.
  days: s.days.map((d) => ({ name: d.name, focus: d.focus, exercises: sortBySection(d.exercises).map(stripId), ...(d.rest ? { rest: true } : {}), templateId: d.templateId })),
})

/** Valen för antal träningsdagar per vecka (v43). */
const DAYS_PER_WEEK = [2, 3, 4, 5, 6]
const LEVEL_KEY: Record<Split["level"], "beginner" | "intermediate" | "advanced" | "all"> = { Nybörjare: "beginner", Van: "intermediate", Avancerad: "advanced", "Alla nivåer": "all" }

/** En sparad mall som ett upplägg med en dag – öppnas och redigeras i samma byggare. */
function templateSplit(tpl: WorkoutTemplate): Split & { days: (SplitDay & { templateId: ID })[] } {
  return {
    key: "custom",
    name: tpl.name,
    short: "",
    description: tpl.description,
    level: "Alla nivåer",
    weekdays: [0],
    days: [{ name: tpl.name, focus: tpl.description, templateId: tpl.id, exercises: tpl.exercises.map((e) => ({ ...e, id: undefined }) as unknown as SplitExercise) }],
  }
}

export function SplitBuilder({ mode, onDone }: { mode: "client" | "trainer"; onDone?: () => void }) {
  const { data, actions, me } = useAppData()
  const t = useT()
  const [split, setSplit] = React.useState<EditSplit | null>(null)
  const [daysPerWeek, setDaysPerWeek] = React.useState(3)
  const [asTemplates, setAsTemplates] = React.useState(false)
  const [customDays, setCustomDays] = React.useState<number | undefined>(3)
  const [showErrors, setShowErrors] = React.useState(false)
  const nameOf = (id: string) => {
    const e = data.exercises.find((x) => x.id === id)
    return exerciseNameIn(e, t.locale, e?.name ?? id)
  }
  // v58: filtret Alla/Styrka/Löpning/Hyrox – förvalt efter träningsintressena, "För dig" först.
  const interests = data.preferences?.trainingInterests
  const favoured = favouredCategories(interests)
  const [category, setCategory] = React.useState<PlanCategory | "all">(() => defaultCategory(interests))
  const shown = SPLITS.filter((s) => category === "all" || splitCategories(s).includes(category)).sort(
    (a, b) => Number(splitCategories(b).some((c) => favoured.has(c))) - Number(splitCategories(a).some((c) => favoured.has(c)))
  )
  const tipCategory: PlanCategory | null = category !== "all" ? category : ([...favoured][0] ?? null)
  const templates = myTemplates(data, me.id)

  const choose = (s: Split & { days: (SplitDay & { templateId?: ID })[] }) => {
    // v58: dagarnas namn på användarens språk (de blir passens namn i kalendern).
    const cloned = cloneSplit(s)
    const copy = { ...cloned, days: s.days.map((d, i) => ({ ...cloned.days[i], templateId: (d as SplitDay & { templateId?: ID }).templateId, ...(d.i18n ? { name: t(`plans.day.${d.i18n}`), focus: t(`plans.focus.${d.i18n}`) } : {}) })) }
    const training: EditDay[] = copy.days.map((d) => ({ ...d, id: actions.newId(), exercises: d.exercises.map((e) => ({ ...e, id: actions.newId() })) }))
    // v52: uppläggen läggs ut på en vecka med vilodagar emellan – de kan flyttas fritt.
    const restDay = (): EditDay => ({ id: actions.newId(), name: t("fields.restDay"), focus: "", exercises: [], rest: true })
    setSplit({ ...copy, days: copy.days.length > 1 ? withRestDays(training, copy.weekdays, restDay) : training })
    setDaysPerWeek(suggestedDaysPerWeek(copy.days.length))
    setShowErrors(false)
  }

  if (!split) {
    return (
      <div className="space-y-3" data-testid="split-library">
        <p className="rounded-2xl bg-primary/8 px-3.5 py-3 text-sm text-muted-foreground">{t("plans.intro")}</p>
        <CategoryPills value={category} onChange={setCategory} favoured={favoured} testId="plan-category" />
        {/* Tips för kategorin – fast plats så att listan under inte hoppar när filtret byts. */}
        {tipCategory && (
          <section className="min-h-[6.5rem] rounded-2xl border border-border/70 bg-card px-4 py-3" aria-label={t("plans.tipsTitle")} data-testid="plan-tips">
            <p className="text-xs font-semibold text-primary">
              {t("plans.tipsTitle")} · {t(`filter.${tipCategory}`)}
            </p>
            <ul className="mt-1.5 space-y-1 text-[13px] text-muted-foreground">
              {[1, 2, 3].map((n) => (
                <li key={n} className="flex gap-2">
                  <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-primary" />
                  {t(`tips.${tipCategory}${n}`)}
                </li>
              ))}
            </ul>
          </section>
        )}
        <ul className="grid gap-2 sm:grid-cols-2" data-testid="split-list">
          {shown.map((s) => (
            <li key={s.key} data-categories={splitCategories(s).join(" ")}>
              <button
                type="button"
                onClick={() => choose(s)}
                className="group flex h-full w-full flex-col gap-1.5 rounded-2xl border bg-card p-4 text-left shadow-card transition-[border-color,background-color,transform] duration-200 hover:border-primary/50 hover:bg-primary/5 active:scale-[0.99]"
                data-testid={`split-${s.key}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 font-semibold">
                    <span className="truncate">{hasMessage(`plans.name.${s.key}`) ? t(`plans.name.${s.key}`) : s.name}</span>
                    {splitCategories(s).some((c) => favoured.has(c)) && (
                      <span className="shrink-0 rounded-full bg-primary/12 px-1.5 py-0.5 text-[10px] font-semibold text-primary" data-testid="for-you">
                        {t("filter.forYou")}
                      </span>
                    )}
                  </span>
                  <Badge variant="secondary" className="shrink-0">
                    {t("plans.perWeek", { n: s.days.length })}
                  </Badge>
                </span>
                <span className="text-xs text-muted-foreground">{t(`plans.desc.${s.key}`)}</span>
                <span className="mt-auto flex flex-wrap gap-1 pt-1">
                  {s.days.slice(0, 6).map((d) => (
                    <span key={d.name} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                      {d.i18n ? t(`plans.day.${d.i18n}`) : d.name}
                    </span>
                  ))}
                </span>
                <span className="flex items-center justify-between pt-0.5 text-[11px] text-muted-foreground">
                  {t(`plans.level.${LEVEL_KEY[s.level]}`)}
                  <span className="flex items-center gap-1 font-medium text-primary">
                    {t("plans.tryIt")} <ArrowRight className="size-3 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {/* Mina mallar – sparade pass (klientens egna eller PT:ns bibliotek) öppnas i samma byggare. */}
        {templates.length > 0 && (
          <section className="space-y-2 pt-2" aria-labelledby="my-templates-title" data-testid="my-templates">
            <h2 id="my-templates-title" className="flex items-center gap-1.5 px-1 text-sm font-semibold">
              <LayoutTemplate className="size-4 text-muted-foreground" aria-hidden /> {t("builder.myTemplates")}
            </h2>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {templates.map((tpl) => (
                <li key={tpl.id} className="flex items-center gap-1 rounded-2xl border bg-card pr-1 shadow-card" data-testid="my-template">
                  <button type="button" onClick={() => choose(templateSplit(tpl))} className="flex min-h-12 min-w-0 flex-1 flex-col justify-center rounded-2xl px-3.5 py-2 text-left hover:bg-muted/40" data-testid="open-template">
                    <span className="truncate text-sm font-medium">{tpl.name}</span>
                    <span className="text-xs text-muted-foreground tabular">{t("builder.exercisesN", { n: tpl.exercises.length })}</span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${t("builder.deleteTemplate")}: ${tpl.name}`}
                    onClick={async () => {
                      if (!(await confirmDialog({ title: `${t("builder.deleteTemplate")}?`, description: tpl.name, confirmLabel: t("common.remove"), destructive: true }))) return
                      actions.deleteTemplate(tpl.id)
                    }}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-dashed p-4">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="font-semibold">{t("builder.custom")}</p>
            <p className="text-xs text-muted-foreground">{t("builder.customLead")}</p>
          </div>
          <NumberInput min={1} max={7} value={customDays} onValueChange={setCustomDays} aria-label="Antal pass" className="h-10 w-16 tabular" />
          <Button variant="outline" onClick={() => choose(customSplit(customDays ?? 3))} data-testid="split-custom">
            <Plus /> {t("builder.create")}
          </Button>
        </div>
      </div>
    )
  }

  const plain = toPlain(split)
  const restDays = split.days.filter((d) => d.rest).length
  const trainingDays = split.days.length - restDays
  const emptyDays = split.days.filter((d) => !d.rest && d.exercises.length === 0).length
  const incomplete = incompleteExercises(split)
  const addRest = () => setSplit({ ...split, days: [...split.days, { id: actions.newId(), name: t("fields.restDay"), focus: "", exercises: [], rest: true }] })
  const removeDay = (id: string) => setSplit({ ...split, days: split.days.filter((d) => d.id !== id) })
  const updateDay = (i: number, patch: Partial<EditDay>) => setSplit({ ...split, days: split.days.map((d, j) => (j === i ? { ...d, ...patch } : d)) })
  const addTo = (i: number, e: Exercise) => updateDay(i, { exercises: [...split.days[i].exercises, { ...splitExerciseFor(e), id: actions.newId() }] })

  /** Kontrollera fälten. Returnerar false (med ett felmeddelande) om något saknas. */
  const valid = () => {
    if (emptyDays === trainingDays) {
      toast.error(t("builder.noExercises"))
      return false
    }
    // v43: tomma fält fylls aldrig i automatiskt – användaren skriver sina egna siffror.
    if (incomplete.length) {
      setShowErrors(true)
      toast.error(`Fyll i fälten för ${incomplete.length === 1 ? nameOf(incomplete[0].exerciseId) : `${incomplete.length} övningar`}`)
      return false
    }
    return true
  }
  const trainingPlainDays = () => plain.days.filter((x) => !x.rest && x.exercises.length)
  const activeDays = () => plain.days.filter((d) => d.rest || d.exercises.length).map((d) => ({ name: d.name, focus: d.focus, exercises: d.exercises, ...(d.rest ? { rest: true } : {}) }))

  /** Varje träningsdag blir en mall. En dag som öppnats från en mall sparas tillbaka till den. */
  const saveTemplates = () => {
    let n = 0
    for (const d of trainingPlainDays()) {
      const replace = d.templateId ? templates.find((x) => x.id === d.templateId) : undefined
      const name = replace ? d.name : split.short ? `${split.short}: ${d.name}` : d.name
      actions.saveTemplate(buildTemplate({ ownerId: me.id, name, description: d.focus, exercises: d.exercises.map((e) => ({ ...e, id: actions.newId() })), newId: actions.newId, replace }))
      n++
    }
    return n
  }
  const plan = { name: split.name.trim() || "Mitt upplägg", short: split.short, key: split.key, daysPerWeek }

  const useAsClient = () => {
    if (!valid()) return
    if (asTemplates) saveTemplates()
    actions.saveActiveSplit({ ...plan, days: activeDays() })
    toast.success(`${plan.name} är ditt upplägg`, { description: `${daysPerWeek} pass i veckan. Tryck på Nästa pass på startsidan när du ska träna.` })
    onDone?.()
  }

  return (
    <div className="space-y-5" data-testid="split-editor">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label={t("builder.back")} onClick={() => setSplit(null)}>
          <ArrowLeft />
        </Button>
        <Input value={split.name} onChange={(e) => setSplit({ ...split, name: e.target.value.slice(0, 60) })} className="h-11 text-base font-semibold" aria-label={t("builder.planName")} />
      </div>

      {/* v52: dra i handtaget för att flytta en dag – även vilodagarna. */}
      <SortableList
        items={split.days}
        className="space-y-3"
        aria-label="Dagarna i upplägget"
        itemLabel={(d) => (d.rest ? t("fields.restDay") : d.name)}
        onReorder={(ids) => setSplit({ ...split, days: ids.map((id) => split.days.find((d) => d.id === id)!) })}
        renderItem={(d, { handle: dayHandle, index: i }) =>
          d.rest ? (
            <div className="flex items-center gap-2 rounded-2xl border border-dashed bg-card/50 px-3 py-2.5" data-testid="split-rest-day">
              {dayHandle}
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Moon className="size-3.5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{t("fields.restDay")}</span>
                <span className="block text-xs text-muted-foreground">{t("builder.restDayHint")}</span>
              </span>
              <Button variant="ghost" size="icon-sm" aria-label="Ta bort vilodagen" onClick={() => removeDay(d.id)}>
                <Trash2 />
              </Button>
            </div>
          ) : (
            <DayCard
              day={d}
              index={i}
              number={split.days.slice(0, i + 1).filter((x) => !x.rest).length}
              handle={dayHandle}
              showErrors={showErrors}
              nameOf={nameOf}
              onChange={(patch) => updateDay(i, patch)}
              onAdd={(e) => addTo(i, e)}
            />
          )
        }
      />
      <Button variant="outline" className="w-full border-dashed" onClick={addRest} disabled={split.days.length >= MAX_SPLIT_DAYS} data-testid="add-rest-day">
        <Moon /> {t("builder.addRestDay")}
      </Button>

      <div className="space-y-4 rounded-2xl border bg-card p-4 shadow-card" data-testid="split-plan">
        {/* v43: bara antal dagar per vecka – inga veckodagar, inget startdatum, inget antal veckor. */}
        <div className="space-y-2">
          <p id="split-days-per-week" className="text-sm font-medium">
            {t("builder.daysPerWeekQ")}
          </p>
          <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-labelledby="split-days-per-week" data-testid="days-per-week">
            {DAYS_PER_WEEK.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={daysPerWeek === n}
                aria-label={`${n} dagar per vecka`}
                onClick={() => setDaysPerWeek(n)}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center rounded-xl border text-base font-semibold tabular transition-colors duration-200",
                  daysPerWeek === n ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted/60"
                )}
              >
                {n}
                <span className="text-[10px] font-normal opacity-80">{t("builder.daysShort")}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="text-sm text-muted-foreground" data-testid="split-summary">
          {t("builder.summary", { n: trainingDays - emptyDays, d: daysPerWeek, rest: restDays ? t("builder.restDaysN", { n: restDays }) : "" })}
        </p>
        {mode === "client" && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={asTemplates} onCheckedChange={(v) => setAsTemplates(v === true)} />
            <LayoutTemplate className="size-4 text-muted-foreground" /> {t("builder.alsoTemplates")}
          </label>
        )}
      </div>

      {mode === "client" ? (
        <Button size="lg" className="h-12 w-full" onClick={useAsClient} data-testid="split-create">
          <Play /> {t("builder.usePlan")}
        </Button>
      ) : (
        <PtActions
          trainingDays={trainingDays - emptyDays}
          onAssign={(clientIds) => {
            if (!valid()) return false
            const error = actions.assignSplit(clientIds, { ...plan, days: activeDays() })
            if (error) {
              toast.error(error)
              return false
            }
            const names = clientIds.map((id) => data.clients.find((c) => c.id === id)?.name ?? "").filter(Boolean)
            toast.success(t("builder.assigned"), { description: `${plan.name} → ${names.join(", ")}` })
            onDone?.()
            return true
          }}
          onSaveTemplates={() => {
            if (!valid()) return
            const n = saveTemplates()
            toast.success(split.days.some((d) => d.templateId) && n === 1 ? t("builder.templateUpdated") : n === 1 ? t("builder.templateSaved1") : t("builder.templatesSaved", { n }))
            onDone?.()
          }}
        />
      )}
    </div>
  )
}

/**
 * PT:ns val när upplägget är klart (v59) – det enda som skiljer byggaren mellan
 * rollerna. Fast minsta höjd, så att inget hoppar när läget byts.
 */
function PtActions({ trainingDays, onAssign, onSaveTemplates }: { trainingDays: number; onAssign: (clientIds: ID[]) => boolean; onSaveTemplates: () => void }) {
  const { data, me } = useAppData()
  const t = useT()
  const [action, setAction] = React.useState<"assign" | "template">("assign")
  const [chosen, setChosen] = React.useState<ID[]>([])
  const active = data.relationships.filter((r) => r.trainerId === me.id && r.status === "active")
  const clients = active.map((r) => data.clients.find((c) => c.id === r.clientId)).filter((c): c is NonNullable<typeof c> => Boolean(c))
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-3 shadow-card" data-testid="pt-actions">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label="Vad vill du göra?" data-testid="pt-action">
        {(
          [
            ["assign", t("builder.ptAssign"), Users],
            ["template", t("builder.ptTemplate"), LayoutTemplate],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={action === key}
            data-action={key}
            onClick={() => setAction(key)}
            className={cn(
              "flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-medium transition-[background-color,color,box-shadow] duration-200",
              action === key ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </div>
      {/* Fast höjd i båda lägena – panelen hoppar inte när läget byts (många klienter: rulla inuti). */}
      <div className="h-[10rem] overflow-y-auto overscroll-contain">
        {action === "assign" ? (
          clients.length ? (
            <div className="space-y-2">
              <p className="px-1 text-xs font-medium text-muted-foreground">{t("builder.chooseClients")}</p>
              <ul className="flex flex-wrap gap-1.5" data-testid="assign-clients">
                {clients.map((c) => {
                  const on = chosen.includes(c.id)
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        data-client={c.id}
                        onClick={() => setChosen(on ? chosen.filter((x) => x !== c.id) : [...chosen, c.id])}
                        className={cn(
                          "inline-flex h-10 items-center gap-2 rounded-full border pr-3 pl-1 text-sm transition-[background-color,border-color] duration-200",
                          on ? "border-primary bg-primary/10 font-medium" : "border-border/70 bg-background hover:border-primary/50"
                        )}
                      >
                        <PersonAvatar name={c.name} src={c.avatarUrl} className="size-8" />
                        {c.name}
                        <Check className={cn("size-3.5 text-primary transition-opacity duration-200", on ? "opacity-100" : "opacity-0")} strokeWidth={3} aria-hidden />
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className="px-1 text-xs text-muted-foreground">{t("builder.replaces")}</p>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">{t("builder.noClients")}</p>
          )
        ) : (
          <p className="px-1 pt-1 text-sm text-muted-foreground">{t("builder.templateHint")}</p>
        )}
      </div>
      {action === "assign" ? (
        <Button size="lg" className="h-12 w-full" disabled={!chosen.length} onClick={() => onAssign(chosen) && setChosen([])} data-testid="split-assign">
          <UserRoundCheck /> {chosen.length === 1 ? t("builder.assign1") : t("builder.assignN", { n: chosen.length })}
        </Button>
      ) : (
        <Button size="lg" className="h-12 w-full" onClick={onSaveTemplates} data-testid="split-create">
          <Check /> {trainingDays === 1 ? t("builder.saveTemplate1") : t("builder.saveTemplatesN", { n: trainingDays })}
        </Button>
      )}
    </div>
  )
}

/** En träningsdag: namn, övningar (drag-and-drop och block) och lägg till / skapa egen övning. */
function DayCard({
  day,
  index,
  number,
  handle,
  showErrors,
  nameOf,
  onChange,
  onAdd,
}: {
  day: EditDay
  index: number
  number: number
  handle: React.ReactNode
  showErrors: boolean
  nameOf: (id: string) => string
  onChange: (patch: Partial<EditDay>) => void
  onAdd: (e: Exercise) => void
}) {
  const t = useT()
  const items = day.exercises
  const setItems = (exercises: EditExercise[]) => onChange({ exercises })
  // v58: block/varv – övningar i följd med samma blockId. Varven gäller hela blocket.
  const blockOf = new Map<string, { id: string; name: string; first: boolean; rounds: number | undefined }>()
  for (const b of blocks(items)) if (b.id && b.name) b.items.forEach((it, i) => blockOf.set(it.id, { id: b.id!, name: b.name!, first: i === 0, rounds: b.items[0].sets }))
  return (
    <div className="space-y-2 rounded-2xl border bg-card p-3 shadow-card" data-testid="split-day">
      <div className="flex items-center gap-2">
        {handle}
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{number}</span>
        <Input value={day.name} onChange={(e) => onChange({ name: e.target.value.slice(0, 40) })} className="h-9 font-medium" aria-label={t("builder.dayName", { n: index + 1 })} />
      </div>
      {items.length ? (
        <SortableList
          items={items}
          as="ul"
          className="space-y-1.5"
          aria-label={`Övningar dag ${index + 1}`}
          itemLabel={(e) => nameOf(e.exerciseId)}
          onReorder={(ids) => setItems(ids.map((id) => items.find((e) => e.id === id)!))}
          renderItem={(e, { handle: exHandle, index: j }) => {
            const block = blockOf.get(e.id)
            return (
              <SplitExerciseRow
                showErrors={showErrors}
                exercise={e}
                name={nameOf(e.exerciseId)}
                handle={exHandle}
                block={block}
                onChange={(patch) => {
                  // Varv i ett block ändrar hela blocket.
                  const next = items.map((x) => (x.id === e.id ? { ...x, ...patch } : x))
                  setItems(block && "sets" in patch ? setBlockRounds(next, block.id, patch.sets) : next)
                }}
                onLink={j > 0 && !block ? () => setItems(linkToPrevious(items, j, () => `b${items.length}${j}${Math.random().toString(36).slice(2, 6)}`)) : undefined}
                onUnlink={block ? () => setItems(unlink(items, j)) : undefined}
                onReplace={(next) => {
                  setItems(items.map((x) => (x.id === e.id ? replaceSplitExercise(x, next) : x)))
                  toast.success(`Bytt till ${next.name}`)
                }}
                onRemove={() => setItems(items.filter((x) => x.id !== e.id))}
              />
            )
          }}
        />
      ) : (
        <p className="rounded-xl border px-3 py-2 text-xs text-muted-foreground">{t("builder.noExercises")}</p>
      )}
      {/* v43: lägg till ur övningslistan (muskelgrupper + Löpning/Hyrox) eller skapa en egen övning direkt i byggaren. */}
      <div className="grid grid-cols-2 gap-2">
        <ExercisePickerDialog
          title={`${t("builder.addExercise")}: ${day.name}`}
          listLabel="Övningar att lägga till"
          allowCustom
          onPick={onAdd}
          trigger={
            <Button variant="outline" size="sm" className="w-full border-dashed" data-testid="split-add-exercise">
              <Plus /> {t("builder.addExercise")}
            </Button>
          }
        />
        <CreateCustomExerciseButton dayName={day.name} onCreated={onAdd} />
      </div>
    </div>
  )
}

/**
 * En övning i en dag: handtag för drag-and-drop, namnet (tryck för att byta),
 * de adaptiva fälten för träningsformen och – bakom "Mer" – del av passet,
 * vila, RPE, reps per set, instruktioner och video. Inga 1RM-beräkningar.
 */
function SplitExerciseRow({
  showErrors = false,
  exercise,
  name,
  handle,
  block,
  onChange,
  onRemove,
  onReplace,
  onLink,
  onUnlink,
}: {
  /** Markera tomma fält (efter ett försök att spara). */
  showErrors?: boolean
  exercise: EditExercise
  name: string
  handle: React.ReactNode
  block?: { name: string; first: boolean; rounds: number | undefined }
  onChange: (patch: Partial<EditExercise>) => void
  onRemove: () => void
  onReplace: (e: Exercise) => void
  onLink?: () => void
  onUnlink?: () => void
}) {
  const t = useT()
  const type = exercise.trackingType ?? "strength"
  const [more, setMore] = React.useState(false)
  const extras = Boolean(exercise.notes || exercise.videoUrl || exercise.rpe || exercise.setReps || exercise.section)
  return (
    <div className={cn("rounded-xl border bg-background px-2 py-1.5", block && "border-l-4 border-l-primary")} data-testid="split-exercise" data-tracking={type} data-block={block?.name}>
      {block?.first && (
        <div className="flex items-center gap-2 px-1 pt-0.5 pb-1 text-xs font-semibold text-primary" data-testid="block-header">
          <Link2 className="size-3.5" aria-hidden /> {t("fields.block", { name: block.name })}
          <label className="ml-auto flex items-center gap-1 font-normal text-muted-foreground">
            {t("fields.rounds")}
            <NumberInput
              min={1}
              max={20}
              value={block.rounds}
              onValueChange={(v) => onChange({ sets: v === undefined ? undefined : Math.min(20, v) })}
              className="h-7 w-14 text-center tabular"
              aria-label={t("fields.blockRounds", { name: block.name, n: block.rounds ?? "" })}
            />
          </label>
        </div>
      )}
      <div className="flex items-center gap-0.5">
        {handle}
        {/* v38: tryck på namnet för att byta övning – fälten ligger kvar. */}
        <ExercisePickerDialog
          title="Byt övning"
          description={`Ersätt ${name}. Set och reps ligger kvar.`}
          currentId={exercise.exerciseId}
          listLabel="Övningar att byta till"
          onPick={(e) => onReplace(e)}
          trigger={
            <button type="button" className="flex min-h-9 min-w-0 flex-1 items-center gap-1.5 rounded-md text-left text-sm font-medium hover:text-primary" aria-label={`Byt ${name}`} data-testid="replace-exercise">
              <span className="truncate">{name}</span>
              {exercise.section && exercise.section !== "main" && <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-normal text-muted-foreground">{SECTION_LABEL[exercise.section]}</span>}
              <RefreshCw className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          }
        />
        {onLink && (
          <Button variant="ghost" size="icon-sm" aria-label={t("fields.linkBlock")} title={t("fields.linkBlock")} onClick={onLink} data-testid="link-block">
            <Link2 />
          </Button>
        )}
        {onUnlink && (
          <Button variant="ghost" size="icon-sm" aria-label={t("fields.unlinkBlock")} title={t("fields.unlinkBlock")} onClick={onUnlink} data-testid="unlink-block">
            <Unlink />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-expanded={more}
          aria-label={`${t("builder.more")}: ${name}`}
          onClick={() => setMore((m) => !m)}
          className={cn(extras ? "text-primary" : "text-muted-foreground")}
          data-testid="exercise-more"
        >
          <SlidersHorizontal />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Ta bort ${name}`} onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>
      <div className="pt-1 pl-10">
        {type !== "strength" ? (
          // v58: löpning och kondition – bara deras egna fält.
          <AdaptiveFields type={type} item={exercise} onUpdate={(p) => onChange(p as Partial<EditExercise>)} name={name} inBlock={Boolean(block)} />
        ) : (
          <div className={cn("grid gap-2", block ? "grid-cols-2" : "grid-cols-3")}>
            {!block && (
              <label className="space-y-0.5">
                <span className="block text-[11px] text-muted-foreground">{t("fields.set")}</span>
                <NumberInput
                  min={1}
                  max={20}
                  value={exercise.sets}
                  // Tomt fält = tomt värde (undefined) – ingen automatisk etta.
                  onValueChange={(v) => onChange({ sets: v === undefined ? undefined : Math.min(20, v), setReps: exercise.setReps ? resize(exercise.setReps, v) : undefined })}
                  aria-invalid={(showErrors && !exercise.sets) || undefined}
                  aria-label={`Set för ${name}`}
                  className="h-9 tabular"
                />
              </label>
            )}
            <label className="space-y-0.5">
              <span className="block text-[11px] text-muted-foreground">{t("fields.reps")}</span>
              <Input
                value={exercise.reps}
                onChange={(e) => onChange({ reps: e.target.value.slice(0, 20) })}
                aria-invalid={(showErrors && !exercise.reps.trim()) || undefined}
                aria-label={`Reps för ${name}`}
                placeholder="8–12"
                disabled={Boolean(exercise.setReps)}
                className="h-9 tabular"
              />
            </label>
            <label className="space-y-0.5">
              <span className="block text-[11px] text-muted-foreground">{t("fields.weightKg")}</span>
              <NumberInput
                min={0}
                max={500}
                decimal
                inputMode="decimal"
                value={exercise.targetKg}
                onValueChange={(v) => onChange({ targetKg: v })}
                aria-label={`Startvikt (kg) för ${name}`}
                placeholder="kg"
                className="h-9 tabular"
              />
            </label>
          </div>
        )}
        {more && (
          <div className="mt-2 space-y-2 border-t pt-2" data-testid="exercise-more-panel">
            <div className="grid grid-cols-[1.5fr_1fr_1fr] gap-2">
              <label className="space-y-0.5">
                <span className="block text-[11px] text-muted-foreground">{t("builder.section")}</span>
                <Select value={sectionOf(exercise)} onValueChange={(v) => onChange({ section: v === "main" ? undefined : (v as WorkoutSection) })}>
                  <SelectTrigger className="h-9 w-full" aria-label={`Del av passet för ${name}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WORKOUT_SECTIONS.map((sec) => (
                      <SelectItem key={sec} value={sec}>
                        {SECTION_LABEL[sec]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              {type === "strength" && (
                <>
                  <label className="space-y-0.5">
                    <span className="block text-[11px] text-muted-foreground">{t("fields.restSec")}</span>
                    <NumberInput
                      min={0}
                      max={MAX_REST_SEC}
                      value={exercise.restSec}
                      onValueChange={(v) => onChange({ restSec: v })}
                      aria-invalid={(showErrors && exercise.restSec === undefined) || undefined}
                      aria-label={`Vila (s) för ${name}`}
                      className="h-9 tabular"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="block text-[11px] text-muted-foreground">{t("builder.rpe")}</span>
                    <NumberInput decimal min={1} max={10} value={exercise.rpe} onValueChange={(v) => onChange({ rpe: v })} aria-label={`RPE för ${name}`} className="h-9 tabular" />
                  </label>
                </>
              )}
            </div>
            {type === "strength" && <SetRepsEditor item={exercise} onUpdate={(p) => onChange(p as Partial<EditExercise>)} name={name} />}
            <Textarea
              placeholder={t("builder.notes")}
              rows={2}
              value={exercise.notes ?? ""}
              onChange={(e) => onChange({ notes: e.target.value.slice(0, 500) || undefined })}
              aria-label={`Instruktioner för ${name}`}
            />
            <ExerciseVideoField value={exercise.videoUrl} title={name} onChange={(videoUrl) => onChange({ videoUrl })} />
          </div>
        )}
      </div>
    </div>
  )
}

const resize = (setReps: string[], sets: number | undefined) => Array.from({ length: Math.max(0, Math.min(20, sets ?? setReps.length)) }, (_, i) => setReps[i] ?? "")

/** Standardvärden när en övning läggs i en split: tunga baslyft 6–8 reps, annars 8–12, kondition 500 m. */
export function splitExerciseFor(e: Exercise): SplitExercise {
  // v58: löpning och Hyrox-stationer får sina standardmål.
  if (e.trackingType && e.trackingType !== "strength") return newExerciseEntry(e)
  // Egna övningar har förslag på set, reps och startvikt.
  if (e.custom) {
    const c = e.custom
    const kg = toKg(c.defaultWeight, c.weightUnit)
    return { exerciseId: e.id, sets: c.defaultSets ?? 3, reps: c.defaultReps ?? "10", restSec: 90, ...(kg !== undefined ? { targetKg: kg } : {}) }
  }
  const compound = ["ben", "rygg", "bröst"].includes(e.muscleGroup) && /stång|trap/i.test(e.equipment ?? "")
  return { exerciseId: e.id, sets: 3, reps: e.muscleGroup === "kondition" ? "500 m" : compound ? "6–8" : "8–12", restSec: compound ? 150 : 90 }
}

/**
 * Byt övning i en split (v38): set, reps, vila och anteckningar ligger kvar.
 * Startvikten nollas (den gällde den gamla övningen). Byte till/från kondition
 * får kondition-standarden (distans i stället för reps).
 */
export function replaceSplitExercise<T extends Omit<SplitExercise, "sets" | "restSec">>(current: T, next: Exercise): T {
  // v58: byte mellan träningsformer (styrka ⇄ löpning ⇄ kondition) tar nya övningens fält.
  const fromType = current.trackingType ?? "strength"
  const toType = next.trackingType ?? "strength"
  if (fromType !== toType) {
    const d = splitExerciseFor(next)
    return { ...current, exerciseId: next.id, targetKg: undefined, setReps: undefined, rpe: undefined, trackingType: d.trackingType, distanceM: d.distanceM, paceSecPerKm: d.paceSecPerKm, durationSec: undefined, reps: d.reps, restSec: d.restSec }
  }
  const wasCardio = /\d\s*(m|km|min|s)\b/i.test(current.reps)
  const isCardio = next.muscleGroup === "kondition"
  const defaults = splitExerciseFor(next)
  return { ...current, exerciseId: next.id, targetKg: undefined, ...(wasCardio !== isCardio ? { reps: defaults.reps, restSec: defaults.restSec } : {}) }
}

/** v43: "Skapa egen övning" direkt i en dag – sparas i övningsbiblioteket och läggs i dagen. */
function CreateCustomExerciseButton({ dayName, onCreated }: { dayName: string; onCreated: (e: Exercise) => void }) {
  const t = useT()
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button type="button" variant="outline" size="sm" className="w-full border-dashed" onClick={() => setOpen(true)} data-testid="split-create-exercise">
        <PencilLine /> {t("builder.createExercise")}
      </Button>
      <CustomExerciseDialog open={open} onOpenChange={setOpen} submitLabel={`Spara och lägg i ${dayName}`} onCreated={onCreated} />
    </>
  )
}
