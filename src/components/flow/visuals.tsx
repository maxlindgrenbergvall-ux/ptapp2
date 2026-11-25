"use client"

/**
 * Animerade bilder till introts bildspel (v77/v79). Varje bild spelar sin
 * animation när kortet visas (`active`) och nollställs när det lämnas.
 */
import { AnimatePresence, motion } from "framer-motion"
import { Check, FileText, MessageCircle, Video } from "lucide-react"
import * as React from "react"

import { CountUp, EASE } from "@/components/flow/motion"
import { formatSek } from "@/lib/money"

const card = "relative w-full max-w-[17rem] rounded-3xl border border-white/8 bg-card/80 p-4 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] backdrop-blur"

/** Kort 1: en arbetsvecka där bokningarna fylls på en efter en. */
export function ScheduleVisual({ active, badge }: { active: boolean; badge: string }) {
  const booked = [1, 3, 5, 6, 8, 11, 12, 14]
  return (
    <div className={card}>
      <div className="mb-3 flex items-center justify-between">
        <span className="h-2 w-16 rounded-full bg-muted" />
        <span className="h-2 w-8 rounded-full bg-muted" />
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: 15 }, (_, i) => {
          const on = booked.includes(i)
          return (
            <motion.span
              key={i}
              className="h-7 rounded-lg"
              initial={false}
              animate={{
                backgroundColor: active && on ? "rgba(132,204,22,0.9)" : "rgba(127,127,127,0.14)",
                scale: active && on ? [0.8, 1.06, 1] : 1,
              }}
              transition={{ delay: active && on ? 0.15 + booked.indexOf(i) * 0.09 : 0, duration: 0.4, ease: EASE }}
            />
          )
        })}
      </div>
      <AnimatePresence>
        {active && (
          <motion.span
            key="badge"
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.95, type: "spring", stiffness: 320, damping: 22 }}
            className="absolute -right-4 -bottom-4 flex items-center gap-1.5 rounded-full bg-[#84cc16] px-3 py-1.5 text-xs font-semibold text-[#131916] shadow-lg"
          >
            <Check className="size-3.5" strokeWidth={3} /> {badge}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Kort 2: en betalning som går igenom och blir ett friskvårdskvitto. */
export function PaymentVisual({ active, paid, receipt }: { active: boolean; paid: string; receipt: string }) {
  return (
    <div className="relative w-full max-w-[17rem]">
      <div className={card}>
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-foreground px-2.5 py-1 text-[0.7rem] font-semibold text-background">Apple Pay</span>
          <span className="h-2 w-10 rounded-full bg-muted" />
        </div>
        <p className="mt-5 text-3xl font-bold tracking-tight">
          <CountUp value={active ? 3845 : 0} format={formatSek} />
        </p>
        <div className="mt-4 flex items-center gap-2">
          <motion.span
            className="flex size-6 items-center justify-center rounded-full bg-[#84cc16] text-[#131916]"
            initial={false}
            animate={active ? { scale: 1, opacity: 1 } : { scale: 0.4, opacity: 0 }}
            transition={{ delay: active ? 0.7 : 0, type: "spring", stiffness: 400, damping: 18 }}
          >
            <Check className="size-3.5" strokeWidth={3} />
          </motion.span>
          <motion.span className="text-sm font-medium" initial={false} animate={{ opacity: active ? 1 : 0 }} transition={{ delay: active ? 0.8 : 0 }}>
            {paid}
          </motion.span>
        </div>
      </div>
      <motion.div
        className="absolute -right-3 -bottom-8 flex items-center gap-2 rounded-2xl border border-white/8 bg-card px-3 py-2.5 shadow-xl"
        initial={false}
        animate={active ? { opacity: 1, y: 0, rotate: -3 } : { opacity: 0, y: 18, rotate: 0 }}
        transition={{ delay: active ? 1.0 : 0, duration: 0.5, ease: EASE }}
      >
        <span className="flex size-7 items-center justify-center rounded-lg bg-[#84cc16]/15 text-[#84cc16]">
          <FileText className="size-4" />
        </span>
        <span className="text-xs font-semibold">{receipt}</span>
      </motion.div>
    </div>
  )
}

/** Kort 3: en ring som fylls medan PT:ns netto räknas upp. */
export function MarginVisual({ active, label }: { active: boolean; label: string }) {
  const r = 64
  return (
    <div className="relative flex size-48 items-center justify-center">
      <svg viewBox="0 0 160 160" className="absolute inset-0 -rotate-90">
        <circle cx="80" cy="80" r={r} fill="none" stroke="currentColor" strokeWidth="12" className="text-muted/60" />
        <motion.circle
          cx="80"
          cy="80"
          r={r}
          fill="none"
          stroke="#84cc16"
          strokeWidth="12"
          strokeLinecap="round"
          initial={false}
          animate={{ pathLength: active ? 0.9 : 0 }}
          transition={{ duration: active ? 1.2 : 0.3, ease: EASE, delay: active ? 0.15 : 0 }}
        />
      </svg>
      <div className="text-center">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tracking-tight">
          <CountUp value={active ? 3495 : 0} format={formatSek} />
        </p>
      </div>
    </div>
  )
}

/** Klient: dagens kalorimål räknas upp, makrona fylls och vikten går mot målet. */
export function ProgressVisual({ active }: { active: boolean }) {
  const bars = [
    { label: "Protein", w: 0.78, color: "#3b82f6" },
    { label: "Kolhydrater", w: 0.62, color: "#f59e0b" },
    { label: "Fett", w: 0.45, color: "#ec4899" },
  ]
  return (
    <div className={card}>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[0.7rem] font-medium text-muted-foreground">Idag</p>
          <p className="text-2xl font-bold tracking-tight">
            <CountUp value={active ? 1720 : 0} format={(n) => n.toLocaleString("sv-SE")} /> <span className="text-sm font-medium text-muted-foreground">kcal</span>
          </p>
        </div>
        <svg viewBox="0 0 80 32" className="h-8 w-20" aria-hidden>
          <motion.path
            d="M2 6 C 14 8, 18 14, 30 15 S 50 22, 60 24 S 74 27, 78 28"
            fill="none"
            stroke="#84cc16"
            strokeWidth="3"
            strokeLinecap="round"
            initial={false}
            animate={{ pathLength: active ? 1 : 0 }}
            transition={{ duration: active ? 1.1 : 0.2, ease: EASE, delay: active ? 0.3 : 0 }}
          />
        </svg>
      </div>
      <div className="mt-4 space-y-2.5">
        {bars.map((b, i) => (
          <div key={b.label} className="space-y-1">
            <div className="flex justify-between text-[0.7rem] text-muted-foreground">
              <span>{b.label}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <motion.span
                className="block h-full origin-left rounded-full"
                style={{ backgroundColor: b.color }}
                initial={false}
                animate={{ scaleX: active ? b.w : 0 }}
                transition={{ duration: active ? 0.8 : 0.2, ease: EASE, delay: active ? 0.25 + i * 0.12 : 0 }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Klient: ett kort chattutbyte med PT:n och ett videosamtal som ringer. */
export function ChatVisual({ active }: { active: boolean }) {
  const bubbles = [
    { me: false, text: "Grymt pass idag! Höj marklyften 2,5 kg nästa gång." },
    { me: true, text: "Tack! Ses på torsdag 🙌" },
  ]
  return (
    <div className="relative w-full max-w-[17rem]">
      <div className={card + " space-y-2.5"}>
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-full bg-[#84cc16]/20 text-[0.65rem] font-semibold text-[#84cc16]">PT</span>
          <span className="h-2 w-20 rounded-full bg-muted" />
          <MessageCircle className="ml-auto size-4 text-muted-foreground" />
        </div>
        {bubbles.map((b, i) => (
          <motion.p
            key={i}
            className={
              b.me
                ? "ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-[#84cc16] px-3 py-2 text-xs font-medium text-[#131916]"
                : "w-fit max-w-[85%] rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-xs"
            }
            initial={false}
            animate={active ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 8, scale: 0.96 }}
            transition={{ delay: active ? 0.25 + i * 0.55 : 0, duration: 0.4, ease: EASE }}
          >
            {b.text}
          </motion.p>
        ))}
      </div>
      <AnimatePresence>
        {active && (
          <motion.span
            key="call"
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 1.4, type: "spring", stiffness: 320, damping: 22 }}
            className="absolute -right-3 -bottom-5 flex items-center gap-2 rounded-full bg-card px-3 py-2 text-xs font-semibold shadow-xl ring-1 ring-white/10"
          >
            <span className="relative flex size-6 items-center justify-center rounded-full bg-[#84cc16] text-[#131916]">
              <motion.span
                className="absolute inset-0 rounded-full bg-[#84cc16]"
                animate={{ scale: [1, 1.7], opacity: [0.6, 0] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
              />
              <Video className="relative size-3.5" />
            </span>
            Videosamtal
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}
