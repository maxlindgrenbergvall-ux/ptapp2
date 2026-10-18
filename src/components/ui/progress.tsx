"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { useInView } from "@/lib/use-in-view"
import { Progress as ProgressPrimitive } from "radix-ui"

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  // Stapeln växer fram när den syns (även långt ner på mobilen), och följer sedan värdet.
  const [ref, inView] = useInView<HTMLDivElement>()
  const shown = inView ? value || 0 : 0
  return (
    <ProgressPrimitive.Root
      {...props}
      ref={ref}
      value={value}
      data-slot="progress"
      data-inview={inView}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
        className
      )}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 bg-primary transition-transform duration-700 ease-out will-change-transform motion-reduce:transition-none"
        style={{ transform: `translateX(-${100 - shown}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
