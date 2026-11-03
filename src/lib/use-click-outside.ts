"use client"

import * as React from "react"

/**
 * Anropar `onOutside` när användaren trycker utanför elementet (mus, touch och
 * penna via pointerdown – fungerar även i iOS-webbvyn i Capacitor). Escape
 * stänger också.
 */
export function useClickOutside<T extends HTMLElement>(ref: React.RefObject<T | null>, onOutside: () => void, enabled = true) {
  const latest = React.useRef(onOutside)
  React.useEffect(() => {
    latest.current = onOutside
  })
  React.useEffect(() => {
    if (!enabled) return
    const onPointer = (e: PointerEvent) => {
      const el = ref.current
      if (!el) return
      // composedPath fungerar även genom shadow DOM och för element som tas bort vid klicket.
      if (e.composedPath().includes(el)) return
      latest.current()
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && latest.current()
    // Capture: vi hinner före knappar som stoppar spridningen.
    document.addEventListener("pointerdown", onPointer, true)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointer, true)
      document.removeEventListener("keydown", onKey)
    }
  }, [ref, enabled])
}
