"use client"

import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core"
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"
import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Sorterbar lista (v34) – drag-and-drop för övningar i splits och under passet.
 *
 *   - Dra i handtaget (⋮⋮). Bara handtaget startar en dragning (touch-action: none),
 *     så att resten av kortet går att skrolla och trycka på som vanligt – viktigt
 *     i mobilappen (Capacitor/WebView), där hela sidan annars skulle "fastna".
 *   - Tangentbord: fokusera handtaget och tryck pil upp/ned – övningen flyttas ett
 *     steg i taget och fokus följer med. (Egen hantering i stället för dnd-kits
 *     tangentbordssensor, som räknar med koordinater och missar när korten har
 *     olika höjd, t.ex. ett utfällt kort med set.)
 *   - Skärmläsare: svenska besked om vad som lyfts och var det hamnar.
 *   - Bara vertikal rörelse (kortet följer inte fingret i sidled).
 *   - Lätt vibration (där det stöds) när ett kort lyfts.
 */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 })

export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
  itemLabel,
  className,
  as: List = "ol",
  disabled = false,
  ...rest
}: {
  items: T[]
  /** Den nya ordningen (alla id:n). */
  onReorder: (ids: string[], moved: { id: string; from: number; to: number }) => void
  renderItem: (item: T, ctx: { handle: React.ReactNode; isDragging: boolean; index: number }) => React.ReactNode
  /** Namn som läses upp för skärmläsare, t.ex. övningens namn. */
  itemLabel: (item: T) => string
  className?: string
  as?: "ol" | "ul"
  disabled?: boolean
} & Omit<React.HTMLAttributes<HTMLOListElement>, "children">) {
  const sensors = useSensors(
    // Några pixlars rörelse innan dragningen startar – ett tryck på handtaget är inget drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )
  const [status, setStatus] = React.useState("")
  const focusId = React.useRef<string | null>(null)
  const ids = items.map((i) => i.id)
  const labelOf = (id: string | number) => {
    const item = items.find((i) => i.id === id)
    return item ? itemLabel(item) : "Övningen"
  }
  const pos = (id: string | number) => ids.indexOf(String(id)) + 1
  const announcements: Announcements = {
    onDragStart: ({ active }) => `${labelOf(active.id)} lyft, plats ${pos(active.id)} av ${ids.length}.`,
    onDragOver: ({ active, over }) => (over ? `${labelOf(active.id)} flyttas till plats ${pos(over.id)} av ${ids.length}.` : `${labelOf(active.id)} är utanför listan.`),
    onDragEnd: ({ active, over }) => (over ? `${labelOf(active.id)} släppt på plats ${pos(over.id)} av ${ids.length}.` : `${labelOf(active.id)} släppt.`),
    onDragCancel: ({ active }) => `Flytten avbröts. ${labelOf(active.id)} ligger kvar på plats ${pos(active.id)}.`,
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    onReorder(arrayMove(ids, from, to), { id: String(active.id), from, to })
  }

  /** Tangentbord: flytta ett steg upp (-1) eller ned (+1). */
  const step = (id: string, delta: -1 | 1) => {
    const from = ids.indexOf(id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= ids.length) {
      setStatus(`${labelOf(id)} ligger redan ${delta < 0 ? "först" : "sist"}.`)
      return
    }
    focusId.current = id
    onReorder(arrayMove(ids, from, to), { id, from, to })
    setStatus(`${labelOf(id)} flyttad till plats ${to + 1} av ${ids.length}.`)
  }
  // Fokus stannar på handtaget efter flytten (React behåller elementet; säkra ändå).
  React.useEffect(() => {
    if (!focusId.current) return
    const el = document.querySelector<HTMLElement>(`[data-sortable-id="${window.CSS.escape(focusId.current)}"] [data-testid=drag-handle]`)
    if (el && document.activeElement !== el) el.focus()
    focusId.current = null
  })

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[verticalOnly]}
      onDragStart={() => navigator.vibrate?.(10)}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: "Flytta med pilarna upp och ned, eller dra med fingret eller musen.",
        },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={disabled}>
        <List className={className} {...rest}>
          {items.map((item, index) => (
            <SortableItem key={item.id} id={item.id} label={itemLabel(item)} disabled={disabled} onStep={(d) => step(item.id, d)}>
              {(handle, isDragging) => renderItem(item, { handle, isDragging, index })}
            </SortableItem>
          ))}
        </List>
      </SortableContext>
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
    </DndContext>
  )
}

function SortableItem({
  id,
  label,
  disabled,
  onStep,
  children,
}: {
  id: string
  label: string
  disabled: boolean
  onStep: (delta: -1 | 1) => void
  children: (handle: React.ReactNode, isDragging: boolean) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  const handle = disabled ? null : (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault()
          onStep(e.key === "ArrowUp" ? -1 : 1)
        }
      }}
      aria-label={`Flytta ${label} (pil upp/ned)`}
      aria-roledescription="sorterbar"
      data-testid="drag-handle"
      className={cn(
        "-my-1 flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground transition-colors select-none hover:bg-muted active:cursor-grabbing",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        isDragging && "bg-muted text-foreground"
      )}
    >
      <GripVertical className="size-4" />
    </button>
  )
  return (
    <li
      ref={setNodeRef}
      data-sortable-id={id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative list-none", isDragging && "z-20 rounded-2xl shadow-float ring-2 ring-primary/40")}
    >
      {children(handle, isDragging)}
    </li>
  )
}
