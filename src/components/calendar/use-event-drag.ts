"use client"

/**
 * Dra-och-släpp av kalenderposter med Pointer Events (mus, penna och touch).
 *
 * - Bara poster med `movable` (preliminära pass) går att dra. Bekräftade pass,
 *   blockeringar och planerade pass är låsta och beter sig som vanliga knappar.
 * - Dragningen startar först efter några pixlars rörelse, så ett vanligt klick
 *   öppnar fortfarande detaljerna.
 * - Målet räknas fram av vyn (`resolve`): tidsrutnätet ger dag + tid (snäpp på
 *   15 min), månadsvyn ger dag med samma klockslag.
 * - Escape avbryter. Vid släpp anropas `onDrop` med den nya starttiden; vyn
 *   visar under tiden en förhandsvisning (`preview`).
 */
import * as React from "react"

import type { CalItem } from "@/components/calendar/items"

export interface DragPreview {
  item: CalItem
  start: Date
  end: Date
  /** false = krockar eller ligger bakåt i tiden (visas rött, släpp ignoreras). */
  valid: boolean
}

export interface DragPointer {
  clientX: number
  clientY: number
  /** Var i posten användaren tog tag (px från postens överkant). */
  grabOffsetY: number
}

const THRESHOLD_PX = 5

export function useEventDrag(opts: {
  resolve: (pointer: DragPointer, item: CalItem) => Date | null
  validate: (item: CalItem, start: Date, end: Date) => boolean
  onDrop: (item: CalItem, start: Date) => void
  /** Anropas under dragningen (t.ex. för autoscroll). */
  onDragMove?: (pointer: DragPointer) => void
}) {
  const optsRef = React.useRef(opts)
  React.useEffect(() => {
    optsRef.current = opts
  })
  const [preview, setPreview] = React.useState<DragPreview | null>(null)
  const state = React.useRef<{
    item: CalItem
    pointerId: number
    x0: number
    y0: number
    grabOffsetY: number
    started: boolean
    last: DragPreview | null
  } | null>(null)
  /** Ett klick direkt efter en dragning ska inte öppna detaljerna. */
  const suppressClick = React.useRef(false)

  const cancel = React.useCallback(() => {
    if (state.current?.started) {
      suppressClick.current = true
      window.setTimeout(() => (suppressClick.current = false), 0)
    }
    state.current = null
    setPreview(null)
  }, [])

  React.useEffect(() => {
    if (!preview) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cancel()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [preview, cancel])

  const bind = (item: CalItem) => {
    if (!item.movable) return {}
    return {
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        if (e.button !== 0) return
        const rect = e.currentTarget.getBoundingClientRect()
        state.current = { item, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, grabOffsetY: e.clientY - rect.top, started: false, last: null }
        e.currentTarget.setPointerCapture(e.pointerId)
      },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
        const s = state.current
        if (!s || s.pointerId !== e.pointerId) return
        if (!s.started && Math.hypot(e.clientX - s.x0, e.clientY - s.y0) < THRESHOLD_PX) return
        s.started = true
        e.preventDefault()
        const pointer = { clientX: e.clientX, clientY: e.clientY, grabOffsetY: s.grabOffsetY }
        optsRef.current.onDragMove?.(pointer)
        const start = optsRef.current.resolve(pointer, s.item)
        if (!start) return
        const end = new Date(start.getTime() + (s.item.end.getTime() - s.item.start.getTime()))
        if (s.last && s.last.start.getTime() === start.getTime()) return
        const next = { item: s.item, start, end, valid: start > new Date() && optsRef.current.validate(s.item, start, end) }
        s.last = next
        setPreview(next)
      },
      onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
        const s = state.current
        if (!s || s.pointerId !== e.pointerId) return
        if (s.started) {
          const moved = s.last && s.last.start.getTime() !== s.item.start.getTime()
          if (moved && s.last!.valid) optsRef.current.onDrop(s.item, s.last!.start)
        }
        cancel()
      },
      onPointerCancel: cancel,
      onClickCapture: (e: React.MouseEvent) => {
        if (suppressClick.current) {
          e.preventDefault()
          e.stopPropagation()
        }
      },
    }
  }

  return { preview, bind, dragging: preview !== null }
}
