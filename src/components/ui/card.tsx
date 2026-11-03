import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Kort. På mobil (under 640 px) mindre luft – gap 4 och py 4 i stället för 6 –
 * så att mer får plats utan att något trycks ihop. Datorvyn är oförändrad.
 * Har kortet ett eget gap/py (t.ex. "gap-3") gäller det även på mobil.
 */
/** Mobilens mindre sidopadding – bara om komponenten inte redan har en egen (px-0, p-0 …). */
const mobilePx = (className?: string) => !/(^|\s)(px|p)-/.test(className ?? "") && "max-sm:px-4"

function Card({ className, ...props }: React.ComponentProps<"div">) {
  const own = className ?? ""
  return (
    <div
      data-slot="card"
      className={cn(
        "flex flex-col gap-6 rounded-2xl border border-border/70 bg-card py-6 text-card-foreground shadow-card",
        !/(^|\s)gap-/.test(own) && "max-sm:gap-4",
        !/(^|\s)py-/.test(own) && "max-sm:py-4",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        mobilePx(className),
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-tight font-semibold tracking-tight", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", mobilePx(className), className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", mobilePx(className), className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
