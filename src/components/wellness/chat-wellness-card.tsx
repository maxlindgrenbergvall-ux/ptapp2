"use client"

/**
 * Överst i klientens chatt med PT:n (v75), först efter första köpet (eller för
 * PT:ns egna klienter): PT:ns hemsida och Instagram, och hur man betalar med
 * friskvårdsbidrag i PT:ns portaler. Före första köpet visas inget av detta.
 */
import { HeartPulse } from "lucide-react"
import * as React from "react"

import { TrainerLinks } from "@/components/trainer-links"
import { portalsOf } from "@/components/wellness/wellness-badges"
import { useAppData } from "@/lib/data/store"
import { fetchWellnessInstructions } from "@/lib/wellness/api"
import type { ID } from "@/types/domain"

export function ChatWellnessCard({ trainerId }: { trainerId: ID }) {
  const { data, me } = useAppData()
  const trainer = data.trainers.find((t) => t.id === trainerId)
  const [instructions, setInstructions] = React.useState<string | null>(null)
  const [snapshot] = React.useState(data)

  React.useEffect(() => {
    let alive = true
    void fetchWellnessInstructions(snapshot, me, trainerId).then((t) => alive && setInstructions(t))
    return () => {
      alive = false
    }
  }, [snapshot, me, trainerId])

  if (!trainer) return null
  const portals = portalsOf(trainer)
  const hasLinks = Boolean(trainer.websiteUrl || trainer.instagram)
  if (!hasLinks && !portals.length && !instructions) return null
  return (
    <div className="mb-3 space-y-2 rounded-2xl border border-[#84cc16]/30 bg-[#84cc16]/8 p-3 text-sm" data-testid="chat-wellness-card">
      {(portals.length > 0 || instructions) && (
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 font-medium">
            <HeartPulse className="size-4 text-[#84cc16]" aria-hidden /> Betala med friskvårdsbidrag
          </p>
          {portals.length > 0 && <p className="text-xs text-muted-foreground">{trainer.name} tar emot {portals.join(", ")}.</p>}
          {instructions && <p className="text-xs whitespace-pre-line" data-testid="wellness-instructions">{instructions}</p>}
        </div>
      )}
      {hasLinks && <TrainerLinks trainer={trainer} size="sm" className="justify-start" />}
    </div>
  )
}
