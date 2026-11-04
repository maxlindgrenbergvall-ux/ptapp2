"use client"

import { Check, ChevronDown, Search, X } from "lucide-react"
import * as React from "react"

import { CustomBadge } from "@/components/exercises/custom-exercise-dialog"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useAppData } from "@/lib/data/store"
import { displayGroup, type DisplayGroup, GROUP_LABEL, groupExercises } from "@/lib/exercises/groups"
import { matchesExercise } from "@/lib/exercises/search"
import { cn } from "@/lib/utils"
import type { Exercise } from "@/types/domain"

/**
 * Övningsväljaren (v38) – samma lista överallt där man lägger till eller byter
 * en övning (split, pass, eget pass):
 *
 *   - Grupperad efter muskelgrupp (Bröst, Rygg, Axlar, Biceps, Triceps, Ben,
 *     Baksida lår, Säte, Vader, Mage …) i stället för alfabetiskt.
 *   - Snabbfilter: en rad med muskelgrupps-chips (horisontell scroll på mobilen).
 *   - Varje grupp fälls ut/in med ett tryck; antalet övningar syns i rubriken.
 *   - Sökning (svenska och engelska namn, utrustning) visar träffarna i en lista,
 *     fortfarande i muskelgruppsordning och med gruppen utskriven.
 *   - Vid byte är den nuvarande övningens grupp utfälld och övningen markerad.
 */
export function ExercisePicker({
  onPick,
  listLabel = "Övningar",
  searchId,
  searchLabel = "Sök övning",
  placeholder = "Sök övning, t.ex. knäböj",
  currentId,
  autoFocus = false,
  onQueryChange,
  excludeIds,
  className,
}: {
  /** Övningar som redan finns (döljs i listan). */
  excludeIds?: string[]
  onPick: (exercise: Exercise) => void
  /** Sökningen ändras (t.ex. för "Skapa egen övning" med samma namn). */
  onQueryChange?: (q: string) => void
  /** aria-label på listan (sökträffar). */
  listLabel?: string
  searchId?: string
  searchLabel?: string
  placeholder?: string
  /** Övningen som byts ut – dess grupp fälls ut och den markeras. */
  currentId?: string
  autoFocus?: boolean
  className?: string
}) {
  const { data } = useAppData()
  const [q, setQState] = React.useState("")
  const setQ = (v: string) => {
    setQState(v)
    onQueryChange?.(v)
  }
  const current = data.exercises.find((e) => e.id === currentId)
  const [filter, setFilter] = React.useState<DisplayGroup | null>(null)
  const [open, setOpen] = React.useState<Set<DisplayGroup>>(() => new Set(current ? [displayGroup(current)] : []))
  const excluded = excludeIds?.join(",") ?? ""
  const groups = React.useMemo(() => {
    const skip = new Set(excluded ? excluded.split(",") : [])
    return groupExercises(data.exercises.filter((e) => !skip.has(e.id)))
  }, [data.exercises, excluded])
  const query = q.trim()

  const toggle = (k: DisplayGroup) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })

  const row = (e: Exercise, showGroup: boolean) => {
    const isCurrent = e.id === currentId
    return (
      <li key={e.id}>
        <button
          type="button"
          onClick={() => {
            onPick(e)
            // Väljaren kan ligga kvar (flera övningar i rad): börja om sökningen.
            if (q) setQ("")
          }}
          className={cn("flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60 active:bg-muted", isCurrent && "bg-primary/5")}
          aria-current={isCurrent || undefined}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate">{e.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {showGroup ? `${GROUP_LABEL[displayGroup(e)]} · ` : ""}
              {e.equipment}
            </span>
          </span>
          {e.custom && <CustomBadge />}
          {isCurrent && <Check className="size-4 shrink-0 text-primary" aria-label="Nuvarande övning" />}
        </button>
      </li>
    )
  }

  return (
    <div className={cn("min-w-0 space-y-2", className)} data-testid="exercise-picker">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={searchId}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label={searchLabel}
          autoFocus={autoFocus}
          className="h-10 pr-9 pl-8"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center text-muted-foreground" aria-label="Rensa sökningen">
            <X className="size-4" />
          </button>
        )}
      </div>

      {query ? (
        // Sökträffar: platt lista i muskelgruppsordning, gruppen utskriven.
        (() => {
          const hits = groups.flatMap((g) => g.exercises.filter((e) => matchesExercise(e, query) && (!filter || g.key === filter))).slice(0, 30)
          return (
            <ul className="max-h-[50svh] divide-y overflow-y-auto overscroll-contain rounded-xl border" aria-label={listLabel}>
              {hits.map((e) => row(e, true))}
              {hits.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted-foreground">Ingen övning hittades.</li>}
            </ul>
          )
        })()
      ) : (
        <>
          {/* Snabbfilter: en muskelgrupp i taget (horisontell scroll på mobilen). */}
          <div className="-mx-1 flex min-w-0 gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="group" aria-label="Filtrera på muskelgrupp" data-testid="muscle-filter">
            <Chip active={filter === null} onClick={() => setFilter(null)}>
              Alla
            </Chip>
            {groups.map((g) => (
              <Chip key={g.key} active={filter === g.key} onClick={() => setFilter(filter === g.key ? null : g.key)}>
                {g.label}
              </Chip>
            ))}
          </div>

          <div className="max-h-[55svh] space-y-1.5 overflow-y-auto overscroll-contain" aria-label="Övningar per muskelgrupp">
            {groups
              .filter((g) => !filter || g.key === filter)
              .map((g) => {
                const expanded = filter === g.key || open.has(g.key)
                return (
                  <section key={g.key} className="overflow-hidden rounded-xl border" data-group={g.key}>
                    <h3>
                      <button
                        type="button"
                        onClick={() => (filter === g.key ? setFilter(null) : toggle(g.key))}
                        aria-expanded={expanded}
                        className="flex min-h-11 w-full items-center gap-2 bg-muted/40 px-3 text-left text-sm font-semibold"
                        data-testid={`group-${g.key}`}
                      >
                        <span className="flex-1">{g.label}</span>
                        <span className="text-xs font-normal text-muted-foreground tabular">{g.exercises.length}</span>
                        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
                      </button>
                    </h3>
                    {expanded && (
                      <ul className="divide-y border-t" aria-label={g.label}>
                        {g.exercises.map((e) => row(e, false))}
                      </ul>
                    )}
                  </section>
                )
              })}
          </div>
        </>
      )}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-9 shrink-0 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted/60"
      )}
    >
      {children}
    </button>
  )
}

/**
 * Väljaren i en dialog – nederkantsark på mobilen (full bredd, tummen når),
 * vanlig dialog på datorn. Stängs när en övning valts.
 */
export function ExercisePickerDialog({
  trigger,
  title,
  description,
  onPick,
  currentId,
  listLabel,
}: {
  trigger: React.ReactNode
  title: string
  description?: string
  onPick: (exercise: Exercise) => void
  currentId?: string
  listLabel?: string
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="min-w-0 grid-cols-[minmax(0,1fr)] max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none max-sm:pb-[calc(1rem+var(--safe-bottom))] sm:max-w-md" data-testid="exercise-picker-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {open && (
          <ExercisePicker
            currentId={currentId}
            listLabel={listLabel}
            onPick={(e) => {
              onPick(e)
              setOpen(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
