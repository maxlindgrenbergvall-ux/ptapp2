import { cn } from "@/lib/utils"

/** Platshållare medan data hämtas: ett mjukt block med ett ljussvep (se @utility skeleton). */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" aria-hidden className={cn("skeleton rounded-lg", className)} {...props} />
}

/** Några textrader i olika längd. */
function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  const widths = ["w-full", "w-11/12", "w-4/5", "w-2/3", "w-3/4"]
  return (
    <div className={cn("space-y-2", className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 ? "w-1/2" : widths[i % widths.length])} />
      ))}
    </div>
  )
}

export { Skeleton, SkeletonText }
