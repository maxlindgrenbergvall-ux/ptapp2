"use client"

/**
 * Delade detaljer för en övning i passbyggaren (v59): eget rep-mål per set och
 * instruktionsvideo. Samma komponenter för klient och PT.
 */
import { ListOrdered, Loader2, Trash2, Upload } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { VideoEmbed } from "@/components/video-embed"
import { useAppData } from "@/lib/data/store"
import { ACCEPT, safeName, uploadFile } from "@/lib/storage"
import { cn } from "@/lib/utils"
import { parseVideo } from "@/lib/video"

type RepItem = { reps: string; sets?: number; setReps?: string[] }

/**
 * Eget rep-mål per set (pyramid 12/10/8, drop-set 8/8/AMRAP …). Av = samma
 * reps för alla set.
 */
export function SetRepsEditor({ item, onUpdate, name }: { item: RepItem; onUpdate: (patch: Partial<RepItem>) => void; name: string }) {
  const on = Boolean(item.setReps)
  const count = item.sets ?? item.setReps?.length ?? 0
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-pressed={on}
        className={cn("h-8 px-2 text-xs", on ? "text-primary" : "text-muted-foreground")}
        onClick={() =>
          onUpdate(
            on
              ? // Av: första setets mål blir övningens reps.
                { setReps: undefined, reps: item.setReps?.find((r) => r.trim()) ?? item.reps }
              : { setReps: Array.from({ length: count }, () => item.reps) }
          )
        }
      >
        <ListOrdered /> {on ? "Olika reps per set" : "Olika reps per set (pyramid, drop-set)"}
      </Button>
      {on && (
        <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6" aria-label={`Rep-mål per set för ${name}`}>
          {item.setReps!.map((r, i) => (
            <li key={i}>
              <label className="space-y-1">
                <span className="block text-[11px] text-muted-foreground">Set {i + 1}</span>
                <Input
                  value={r}
                  placeholder={item.reps}
                  aria-label={`Reps set ${i + 1} för ${name}`}
                  onChange={(e) => {
                    const setReps = item.setReps!.slice()
                    setReps[i] = e.target.value
                    // Övningens reps följer första setet (visas i äldre vyer).
                    onUpdate(i === 0 ? { setReps, reps: e.target.value || item.reps } : { setReps })
                  }}
                />
              </label>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** Instruktionsvideo per övning: YouTube-/Vimeo-länk eller egen uppladdad fil. */
export function ExerciseVideoField({
  value,
  title,
  onChange,
}: {
  value?: string
  title: string
  onChange: (v: string | undefined) => void
}) {
  const { me } = useAppData()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)
  const [link, setLink] = React.useState("")

  const upload = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      onChange(await uploadFile("exercise-videos", `${me.id}/${crypto.randomUUID()}-${safeName(file.name)}`, file))
      toast.success("Videon är uppladdad")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Uppladdningen misslyckades")
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  if (value) {
    return (
      <div className="space-y-1.5">
        <VideoEmbed source={value} title={`Instruktionsvideo: ${title}`} />
        <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => onChange(undefined)}>
          <Trash2 /> Ta bort video
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const v = link.trim()
          if (!parseVideo(v)) return toast.error("Klistra in en länk till YouTube, Vimeo eller en videofil (.mp4)")
          onChange(v)
          setLink("")
        }}
      >
        <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="YouTube- eller Vimeo-länk" aria-label="Videolänk" className="h-8 text-sm" />
        <Button type="submit" size="sm" variant="outline" disabled={!link.trim()}>
          Lägg till
        </Button>
      </form>
      <input ref={inputRef} type="file" accept={ACCEPT["exercise-videos"]} className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
      <Button type="button" variant="ghost" size="sm" className="h-auto min-h-8 w-full py-1.5 whitespace-normal text-muted-foreground" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="animate-spin" /> : <Upload />} {busy ? "Laddar upp…" : "eller ladda upp en video (max 200 MB)"}
      </Button>
    </div>
  )
}
