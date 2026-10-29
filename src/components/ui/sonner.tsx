"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/**
 * Notiser: glider in mjukt (överst, under statusfältet), rundade som appens kort,
 * i glas med en färgad ikon per typ. Följer prefers-color-scheme som resten av appen.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      gap={10}
      icons={{
        success: <CircleCheckIcon className="size-[18px] text-success" />,
        info: <InfoIcon className="size-[18px] text-primary" />,
        warning: <TriangleAlertIcon className="size-[18px] text-warning" />,
        error: <OctagonXIcon className="size-[18px] text-destructive" />,
        loading: <Loader2Icon className="size-[18px] animate-spin text-muted-foreground" />,
      }}
      toastOptions={{
        classNames: {
          toast: "rounded-2xl! border-border/70! bg-popover/90! shadow-float! backdrop-blur-xl backdrop-saturate-150 px-4! py-3.5!",
          title: "font-semibold!",
          description: "text-muted-foreground!",
          actionButton: "rounded-lg! font-semibold!",
          cancelButton: "rounded-lg!",
          error: "border-destructive/30!",
          success: "border-success/30!",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "1rem",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
