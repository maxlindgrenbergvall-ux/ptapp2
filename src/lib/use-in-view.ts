"use client"

import * as React from "react"

/**
 * Har elementet synts på skärmen? Används för att starta animationer (staplar,
 * diagram) först när användaren ser dem – på mobilen ligger de ofta långt ner,
 * och en animation som körs vid sidladdning är då klar innan man scrollat dit.
 *
 * Följer `prefers-reduced-motion`: då räknas allt som synligt direkt (ingen
 * animation). Utan IntersectionObserver (äldre webbläsare) visas allt direkt.
 */
export function useInView<T extends Element>(opts: { rootMargin?: string; threshold?: number } = {}) {
  const [node, setNode] = React.useState<T | null>(null)
  const [inView, setInView] = React.useState(false)
  const { rootMargin = "0px 0px -10% 0px", threshold = 0.15 } = opts

  React.useEffect(() => {
    if (!node || inView) return
    if (typeof IntersectionObserver === "undefined" || prefersReducedMotion()) {
      const id = window.requestAnimationFrame(() => setInView(true))
      return () => window.cancelAnimationFrame(id)
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true)
          io.disconnect()
        }
      },
      { rootMargin, threshold }
    )
    io.observe(node)
    return () => io.disconnect()
  }, [node, inView, rootMargin, threshold])

  return [setNode, inView] as const
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}
