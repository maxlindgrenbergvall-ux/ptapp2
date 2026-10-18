"use client"

import * as React from "react"

import { Input } from "@/components/ui/input"

type Props = Omit<React.ComponentProps<"input">, "type" | "value" | "onChange" | "min" | "max" | "step"> & {
  value: number | null | undefined
  /** undefined = tomt fält. */
  onValueChange: (value: number | undefined) => void
  min?: number
  max?: number
  /** Tillåt decimaler (komma eller punkt). */
  decimal?: boolean
}

/** "007" → "7", "00,5" → "0,5", "1.5" → "1,5" med svenskt decimaltecken. */
export function cleanNumber(raw: string, decimal: boolean): string {
  let s = raw.replace(/\s/g, "").replace(/\./g, ",")
  s = decimal ? s.replace(/[^\d,]/g, "") : s.replace(/\D/g, "")
  if (decimal) {
    const [int, ...rest] = s.split(",")
    s = rest.length ? `${int},${rest.join("").slice(0, 2)}` : int
  }
  // Inledande nollor bort, men behåll en nolla före decimaltecknet och en ensam nolla.
  s = s.replace(/^0+(?=\d)/, "")
  return s.startsWith(",") ? `0${s}` : s
}

const parse = (s: string) => (s === "" || s === "," ? undefined : Number(s.replace(",", ".")))
const format = (n: number | null | undefined) => (n === null || n === undefined || Number.isNaN(n) ? "" : String(n).replace(".", ","))

/**
 * Sifferfält utan inledande nollor. Ett vanligt kontrollerat <input type="number">
 * med värdet 0 visar "01" när man skriver en etta (React skriver inte över fältet
 * när siffervärdet är detsamma). Här hålls texten i ett eget tillstånd och
 * städas vid varje tangent; värdet begränsas till min/max när fältet lämnas.
 */
export function NumberInput({ value, onValueChange, min, max, decimal = false, onBlur, onFocus, ...props }: Props) {
  const [draft, setDraft] = React.useState(() => format(value))
  // Följ värdet när det ändras utifrån (t.ex. ett annat val i formuläret).
  const [lastValue, setLastValue] = React.useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    if (parse(draft) !== (value ?? undefined)) setDraft(format(value))
  }

  return (
    <Input
      {...props}
      type="text"
      inputMode={decimal ? "decimal" : "numeric"}
      autoComplete="off"
      value={draft}
      onFocus={(e) => {
        // Markera innehållet så att en ny siffra ersätter det gamla värdet.
        e.currentTarget.select()
        onFocus?.(e)
      }}
      onChange={(e) => {
        let raw = e.target.value
        // Fältet visar "0" och användaren skriver en siffra (före eller efter nollan):
        // nollan var bara ett platshållarvärde och ska ersättas, inte bli "01" eller "10".
        if (draft === "0" && raw.length === 2 && /^\d$/.test(raw.replace("0", ""))) raw = raw.replace("0", "")
        const next = cleanNumber(raw, decimal)
        setDraft(next)
        const n = parse(next)
        setLastValue(n)
        onValueChange(n)
      }}
      onBlur={(e) => {
        const n = parse(draft)
        if (n !== undefined) {
          const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
          setDraft(format(clamped))
          if (clamped !== n) {
            setLastValue(clamped)
            onValueChange(clamped)
          }
        }
        onBlur?.(e)
      }}
    />
  )
}
