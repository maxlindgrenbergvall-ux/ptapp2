"use client"

import { Droplets, Flame, Target, Trophy, UtensilsCrossed, type LucideIcon } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

/**
 * Små belöningar (v52): en kort, vänlig bekräftelse när något blir klart –
 * vattenmålet, en avbockad måltid, alla dagens måltider, veckans träningsmål.
 *
 *   - En limegrön bricka med en ikon som "landar" (settle-in), en ring som
 *     sprids (ring-burst) och tre gnistor. Bara transform/opacity; med
 *     "minska rörelse" visas brickan stilla.
 *   - Texten är konkret (vad som blev klart och hur långt man kommit) – inga
 *     utrop, inga emojis, inget tjat.
 *   - Mål som bara nås en gång per dag (vatten, alla måltider) firas en gång
 *     per dag och enhet, även om man backar och fyller på igen.
 */
export type RewardKind = "water" | "meal" | "meals_done" | "week_goal" | "record" | "streak"

const ICON: Record<RewardKind, LucideIcon> = {
  water: Droplets,
  meal: UtensilsCrossed,
  meals_done: UtensilsCrossed,
  week_goal: Target,
  record: Trophy,
  streak: Flame,
}

/** Brickan: används i toasten och i sammanfattningen efter passet. */
export function RewardBadge({ kind, size = "md", className, delay = 0 }: { kind: RewardKind; size?: "sm" | "md"; className?: string; delay?: number }) {
  const Icon = ICON[kind]
  return (
    <span
      className={cn("settle-in relative flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground", size === "sm" ? "size-7" : "size-9", className)}
      style={{ animationDelay: `${delay}ms` }}
      data-reward={kind}
    >
      <Icon className={size === "sm" ? "size-3.5" : "size-[1.1rem]"} strokeWidth={2.4} aria-hidden />
      <span aria-hidden className="ring-burst" style={{ animationDelay: `${delay + 120}ms` }} />
      {/* Tre gnistor som far ut och tonar bort. */}
      {[
        ["-10px", "-12px"],
        ["13px", "-9px"],
        ["11px", "12px"],
      ].map(([x, y], i) => (
        <span
          key={i}
          aria-hidden
          className="reward-spark absolute size-1 rounded-full bg-primary"
          style={{ ["--spark-x" as string]: x, ["--spark-y" as string]: y, animationDelay: `${delay + 160 + i * 50}ms` }}
        />
      ))}
    </span>
  )
}

const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/** Har belöningen redan visats idag (på den här enheten)? Markerar den som visad. */
function firstToday(key: string): boolean {
  try {
    const k = `coavira:reward:${key}`
    if (localStorage.getItem(k) === todayKey()) return false
    localStorage.setItem(k, todayKey())
  } catch {
    // Privat läge / blockerad lagring: visa hellre en gång för mycket än aldrig.
  }
  return true
}

/**
 * Visa en belöning. `oncePerDay` = nyckel för sådant som bara firas en gång
 * per dag (t.ex. "water:<datum>").
 */
export function reward(kind: RewardKind, title: string, description?: string, opts: { oncePerDay?: string } = {}) {
  if (opts.oncePerDay && !firstToday(opts.oncePerDay)) return
  navigator.vibrate?.([10, 40, 14])
  toast(title, {
    description,
    duration: 3200,
    icon: <RewardBadge kind={kind} size="sm" />,
    className: "reward-toast",
  })
}
