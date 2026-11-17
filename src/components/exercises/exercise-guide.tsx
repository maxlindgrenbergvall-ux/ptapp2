"use client"

/**
 * "Videoguide / Utförande" (v60) – direkt under övningen, i passet och i
 * passbyggaren (klient och PT). Ett tryck fäller ut guiden mjukt rakt under
 * just den övningen (ingen popup), så att set, reps och vikter syns samtidigt.
 *
 *   - AI-video (exercise-guides i Storage) när den finns, annars samma
 *     guide-atlet som animation – ingen förinlagd övning saknar guide.
 *   - Laddas först när guiden fälls ut (video och animation monteras då) och
 *     pausas/släpps när den stängs – inget minne eller batteri i onödan.
 *   - Fast bildformat (16:10) – inget hopp när videon laddats.
 *   - Egna övningar har ingen guide.
 */
import { ChevronDown, PlayCircle } from "lucide-react"
import * as React from "react"

import { GuideFigure } from "@/components/exercises/guide-figure"
import { guideFor, guideVideo } from "@/lib/exercise-guides/guides"
import { useT } from "@/lib/i18n/provider"
import { cn } from "@/lib/utils"
import type { Exercise } from "@/types/domain"

export function ExerciseGuide({ exercise, name, className }: { exercise: Pick<Exercise, "id" | "custom" | "videoUrl"> | undefined; name: string; className?: string }) {
  const t = useT()
  const guide = guideFor(exercise)
  const [open, setOpen] = React.useState(false)
  // Innehållet finns bara medan guiden är öppen (eller håller på att fällas ihop).
  const [mounted, setMounted] = React.useState(false)
  const [videoFailed, setVideoFailed] = React.useState(false)
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const panelId = React.useId()
  if (!guide) return null
  const video = videoFailed ? null : guideVideo(exercise?.videoUrl)

  const toggle = () => {
    if (open) {
      videoRef.current?.pause()
      setOpen(false)
    } else {
      setMounted(true)
      setOpen(true)
    }
  }

  return (
    <div className={cn("min-w-0", className)} data-testid="exercise-guide" data-open={open || undefined}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? t("guide.hide") : t("guide.show", { name })}
        className="flex min-h-9 w-full items-center gap-2 rounded-xl px-2 text-left text-xs font-medium text-primary transition-colors hover:bg-primary/8"
        data-testid="exercise-guide-toggle"
      >
        <PlayCircle className="size-4 shrink-0" aria-hidden />
        <span className="flex-1">{t("guide.title")}</span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform duration-300", open && "rotate-180")} aria-hidden />
      </button>
      {/* Mjuk utfällning (grid-rader 0fr → 1fr) – listan under glider undan, den hoppar inte. */}
      <div
        id={panelId}
        className="grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}
        onTransitionEnd={(e) => {
          if (e.propertyName === "grid-template-rows" && !open) setMounted(false)
        }}
        aria-hidden={!open}
      >
        <div className="min-h-0 overflow-hidden">
          {mounted && (
            <div className="space-y-2 pt-1 pb-1" data-testid="exercise-guide-panel">
              <div className="relative aspect-[16/10] max-h-56 w-full overflow-hidden rounded-2xl bg-[#131916] ring-1 ring-white/5">
                {video ? (
                  <video
                    ref={videoRef}
                    src={video}
                    className="size-full object-cover"
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="metadata"
                    onError={() => setVideoFailed(true)}
                    aria-label={`${t("guide.video")}: ${name}`}
                    data-testid="exercise-guide-video"
                  />
                ) : (
                  <GuideFigure motion={guide.motion} playing={open} title={`${t("guide.animation")}: ${name}`} className="size-full" />
                )}
              </div>
              <ol className="grid gap-1.5 text-[13px]" data-testid="exercise-guide-steps">
                {(["start", "move", "control"] as const).map((k, i) => (
                  <li key={k} className="flex gap-2.5 rounded-xl bg-muted/50 px-3 py-2">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground tabular">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block text-[11px] font-medium text-muted-foreground">{t(`guide.${k}`)}</span>
                      {t(`guide.steps.${guide.steps}.${k}`)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
