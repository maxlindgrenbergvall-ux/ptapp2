"use client"

/**
 * Är skärmtangentbordet uppe? (v69)
 *
 * Sant när ett textfält har fokus på en pekskärm (mobil). På iOS och Android
 * lägger sig annars den fasta bottenmenyn ovanpå tangentbordet. Med mus och
 * tangentbord (dator) finns inget skärmtangentbord, så där är svaret alltid falskt.
 */
import * as React from "react"

const NOT_TEXT = new Set(["button", "checkbox", "radio", "range", "color", "file", "submit", "reset", "image", "hidden"])

function isTextField(el: Element | null): boolean {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled
  if (el instanceof HTMLInputElement) return !NOT_TEXT.has(el.type) && !el.readOnly && !el.disabled
  return el instanceof HTMLElement && el.isContentEditable
}

function snapshot(): boolean {
  if (typeof window === "undefined") return false
  if (!window.matchMedia?.("(pointer: coarse)").matches) return false
  return isTextField(document.activeElement)
}

function subscribe(notify: () => void) {
  // focusout kommer innan nästa fält fått fokus – vänta en bildruta så att menyn inte blinkar mellan fälten.
  let frame = 0
  const later = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(notify)
  }
  document.addEventListener("focusin", notify)
  document.addEventListener("focusout", later)
  return () => {
    cancelAnimationFrame(frame)
    document.removeEventListener("focusin", notify)
    document.removeEventListener("focusout", later)
  }
}

export function useKeyboardOpen(): boolean {
  return React.useSyncExternalStore(subscribe, snapshot, () => false)
}
