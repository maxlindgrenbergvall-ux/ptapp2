"use client"

import { Camera, Loader2, ShieldCheck } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { PersonAvatar } from "@/components/common"
import { Button } from "@/components/ui/button"
import { ACCEPT, uploadFile } from "@/lib/storage"
import { cn } from "@/lib/utils"

/**
 * Profilbild för PT och klient. Bilden laddas upp via servern
 * (/api/uploads/image): bildfiltret (v29) granskar den innan den sparas i
 * avatars/{uid}/. Externa bildlänkar går inte att använda – de skulle kringgå
 * filtret, och databasen stoppar dem (v31).
 */
export function AvatarPicker({
  name,
  value,
  userId,
  onChange,
  size = "md",
  className,
}: {
  name: string
  value: string
  userId: string
  onChange: (url: string) => void
  /** "sm" (v37): kompakt i profilen på mobil. */
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const [blocked, setBlocked] = React.useState<string | null>(null)

  const upload = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setBlocked(null)
    try {
      onChange(await uploadFile("avatars", `${userId}/avatar.webp`, file))
    } catch (e) {
      const message = e instanceof Error ? e.message : "Uppladdningen misslyckades"
      // Stoppad av bildfiltret: visas vid bilden (inte bara som toast) så att det syns tydligt.
      if (/innehållsfilter/.test(message)) setBlocked(message)
      else toast.error(message)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className={cn("flex items-center gap-4 sm:flex-col sm:items-center", className)} data-testid="avatar-picker">
      <div className="relative shrink-0">
        <PersonAvatar
          name={name}
          src={value || undefined}
          className={cn(size === "lg" ? "size-28 text-3xl" : size === "sm" ? "size-16 text-xl" : "size-24 text-2xl", "ring-2 ring-primary/30 ring-offset-2 ring-offset-card")}
        />
        {busy && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full bg-background/80 text-[10px] font-medium">
            <Loader2 className="size-5 animate-spin" />
            Granskar…
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5 sm:items-center">
        <input ref={inputRef} type="file" accept={ACCEPT.avatars} className="sr-only" onChange={(e) => upload(e.target.files?.[0])} aria-label="Välj profilbild" />
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
            <Camera /> {value ? "Byt bild" : "Ladda upp bild"}
          </Button>
          {value && (
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")} disabled={busy}>
              Ta bort
            </Button>
          )}
        </div>
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <ShieldCheck className="size-3.5 shrink-0" /> Granskas automatiskt av vårt bildfilter
        </p>
        {blocked && (
          <p className="max-w-64 text-xs text-destructive" role="alert" data-testid="avatar-blocked">
            {blocked}
          </p>
        )}
      </div>
    </div>
  )
}
