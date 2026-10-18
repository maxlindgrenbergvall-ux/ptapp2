"use client"

import { Search } from "lucide-react"
import * as React from "react"

import { Input } from "@/components/ui/input"
import { FOOD_LIBRARY } from "@/lib/food-library"
import { searchLibrary } from "@/lib/food-search"
import type { Food } from "@/lib/foods"
import { cn } from "@/lib/utils"

/**
 * Snabbsök i livsmedelsbasen: skriv några bokstäver, välj med piltangenter/Enter
 * eller ett tryck. Ersätter den långa rullistan.
 */
export function FoodSearch({
  onPick,
  placeholder = "Sök livsmedel…",
  className,
  autoFocus,
}: {
  onPick: (food: Food) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
}) {
  const id = React.useId()
  const [q, setQ] = React.useState("")
  const [open, setOpen] = React.useState(false)
  const [active, setActive] = React.useState(0)
  const query = q.trim().toLowerCase()
  // Utan sökord visas några vanliga baslivsmedel; annars rankad sökning (tål å/ä/ö-varianter).
  const matches: Food[] = (query ? searchLibrary(query, 8) : FOOD_LIBRARY.slice(0, 6)).map((f) => ({ name: f.name, ...f.per100, servingG: f.servingG }))

  const pick = (food: Food | undefined) => {
    if (!food) return
    onPick(food)
    setQ("")
    setActive(0)
    setOpen(false)
  }

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open && matches[active] ? `${id}-${active}` : undefined}
        aria-autocomplete="list"
        autoFocus={autoFocus}
        value={q}
        placeholder={placeholder}
        className="pl-8"
        onChange={(e) => {
          setQ(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault()
            setOpen(true)
            setActive((a) => Math.min(a + 1, matches.length - 1))
          } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
          } else if (e.key === "Enter") {
            e.preventDefault()
            pick(matches[active])
          } else if (e.key === "Escape") {
            setOpen(false)
          }
        }}
      />
      {open && matches.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border bg-popover p-1 shadow-lg">
          {matches.map((f, i) => (
            <li
              key={f.name}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(f)
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-sm",
                i === active && "bg-accent text-accent-foreground"
              )}
            >
              <span className="truncate">{f.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular">{f.kcal} kcal/100 g</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
