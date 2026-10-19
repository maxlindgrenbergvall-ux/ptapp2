"use client"

import { Camera, Link2, Loader2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { PersonAvatar } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ACCEPT, uploadFile } from "@/lib/storage"

/** Profilbild: ladda upp (bucket avatars/{uid}/…) eller ange en https-länk. Används av både PT och klient. */
export function AvatarPicker({
  name,
  value,
  userId,
  onChange,
}: {
  name: string
  value: string
  userId: string
  onChange: (url: string) => void
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const [showUrl, setShowUrl] = React.useState(false)
  const [url, setUrl] = React.useState("")

  const applyUrl = () => {
    if (!/^https:\/\/\S+$/.test(url.trim())) return toast.error("Ange en https-länk till en bild")
    onChange(url.trim())
    setShowUrl(false)
    setUrl("")
  }

  const upload = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      onChange(await uploadFile("avatars", `${userId}/avatar.webp`, file))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Uppladdningen misslyckades")
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className="flex items-center gap-4 sm:flex-col sm:items-center">
      <div className="relative">
        <PersonAvatar name={name} src={value || undefined} className="size-24 text-2xl ring-2 ring-primary/30 ring-offset-2 ring-offset-card" />
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
            <Loader2 className="size-5 animate-spin" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5 sm:items-center">
        <input ref={inputRef} type="file" accept={ACCEPT.avatars} className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
        <Button type="button" size="sm" variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
          <Camera /> {value ? "Byt bild" : "Ladda upp bild"}
        </Button>
        <div className="flex gap-1">
          <Button type="button" size="xs" variant="ghost" onClick={() => setShowUrl((s) => !s)}>
            <Link2 /> Länk
          </Button>
          {value && (
            <Button type="button" size="xs" variant="ghost" onClick={() => onChange("")}>
              Ta bort
            </Button>
          )}
        </div>
        {/* Ingen egen <form>: väljaren ligger ofta inuti ett profilformulär (nästlade formulär fungerar inte). */}
        {showUrl && (
          <div className="flex gap-1">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  applyUrl()
                }
              }}
              placeholder="https://…"
              className="h-8 w-44 text-xs"
              aria-label="Bildlänk"
            />
            <Button type="button" size="sm" variant="outline" onClick={applyUrl}>
              OK
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

