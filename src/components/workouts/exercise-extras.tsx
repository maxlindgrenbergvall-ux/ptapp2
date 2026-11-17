"use client"

/**
 * Delade detaljer för en övning i passbyggaren (v59): eget rep-mål per set och
 * (v60: instruktionsvideor ersätts av Videoguide / Utförande – exercise-guide.tsx).
 */
import { ListOrdered } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type RepItem = { reps: string; sets?: number; setReps?: string[] }

/**
 * Eget rep-mål per set (pyramid 12/10/8, drop-set 8/8/AMRAP …). Av = samma
 * reps för alla set.
 */
export function SetRepsEditor({ item, onUpdate, name }: { item: RepItem; onUpdate: (patch: Partial<RepItem>) => void; name: string }) {
  const on = Boolean(item.setReps)
  const count = item.sets ?? item.setReps?.length ?? 0
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={on}
        className={cn("h-8 px-2 text-xs", on ? "text-primary" : "text-muted-foreground")}
        onClick={() =>
          onUpdate(
            on
              ? // Av: första setets mål blir övningens reps.
                { setReps: undefined, reps: item.setReps?.find((r) => r.trim()) ?? item.reps }
              : { setReps: Array.from({ length: count }, () => item.reps) }
          )
        }
      >
        <ListOrdered /> {on ? "Olika reps per set" : "Olika reps per set (pyramid, drop-set)"}
      </Button>
      {on && (
        <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label={`Rep-mål per set för ${name}`}>
          {item.setReps!.map((r, i) => (
            <li key={i}>
              <label className="space-y-1">
                <span className="block text-[11px] text-muted-foreground">Set {i + 1}</span>
                <Input
                  value={r}
                  placeholder={item.reps}
                  aria-label={`Reps set ${i + 1} för ${name}`}
                  onChange={(e) => {
                    const setReps = item.setReps!.slice()
                    setReps[i] = e.target.value
                    // Övningens reps följer första setet (visas i äldre vyer).
                    onUpdate(i === 0 ? { setReps, reps: e.target.value || item.reps } : { setReps })
                  }}
                />
              </label>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
