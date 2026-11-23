"use client"

/**
 * Övergången från inloggningen till appen (v72). Inloggningen tonas ut (lätt
 * krympning och oskärpa) innan appen laddas, och appen tonas sedan in (se
 * html.app-enter i globals.css). Med "minska rörelse" sker bytet direkt.
 */
import { prefersReducedMotion } from "@/lib/use-in-view"

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)"

export async function playLoginExit(): Promise<void> {
  const page = document.querySelector<HTMLElement>("main")
  if (!page || prefersReducedMotion() || typeof page.animate !== "function") return
  page.style.pointerEvents = "none"
  await page
    .animate(
      [
        { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)", filter: "blur(0px)" },
        { opacity: 0, transform: "translate3d(0, -10px, 0) scale(0.96)", filter: "blur(6px)" },
      ],
      { duration: 340, easing: EASE, fill: "forwards" }
    )
    .finished.catch(() => {})
}
