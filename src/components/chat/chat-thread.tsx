"use client"

import { Dumbbell, FileText, Loader2, Paperclip, SendHorizontal, X } from "lucide-react"
import { toast } from "sonner"
import * as React from "react"

import { AttachmentView } from "@/components/chat/attachment-view"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useAppData } from "@/lib/data/store"
import { formatShort, formatTime, toISODate } from "@/lib/date"
import { ACCEPT, attachmentKind, formatBytes, MAX_BYTES, safeName, uploadFile } from "@/lib/storage"
import { cn } from "@/lib/utils"
import type { Attachment, ID } from "@/types/domain"

/**
 * Chattråd mellan PT och klient. I Supabase-versionen blir detta en
 * realtidsprenumeration på `messages` filtrerad på thread_id (RLS ser till att
 * bara de två parterna kan läsa tråden).
 */
export function ChatThread({
  threadId,
  meId,
  className,
}: {
  threadId: ID
  meId: ID
  className?: string
}) {
  const { data, actions } = useAppData()
  const [draft, setDraft] = React.useState("")
  const [files, setFiles] = React.useState<File[]>([])
  const [sending, setSending] = React.useState(false)
  const endRef = React.useRef<HTMLDivElement>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const messages = React.useMemo(
    () => data.messages.filter((m) => m.threadId === threadId).sort((a, b) => a.sentAt.localeCompare(b.sentAt)),
    [data.messages, threadId]
  )

  React.useEffect(() => {
    actions.markThreadRead(threadId)
  }, [actions, threadId, messages.length])

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" })
  }, [messages.length])

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const picked = [...list].filter((f) => {
      if (f.size > MAX_BYTES["chat-attachments"]) {
        toast.error(`${f.name} är för stor (max ${formatBytes(MAX_BYTES["chat-attachments"])})`)
        return false
      }
      return true
    })
    setFiles((cur) => [...cur, ...picked].slice(0, 10))
    if (fileRef.current) fileRef.current.value = ""
  }

  const send = async () => {
    if ((!draft.trim() && files.length === 0) || sending) return
    if (files.length === 0) {
      actions.sendMessage(threadId, draft)
      setDraft("")
      return
    }
    // Bilagor laddas upp först (kräver nät), sedan skickas meddelandet via kön.
    setSending(true)
    const id = actions.newId()
    try {
      const attachments: Attachment[] = []
      for (const f of files) {
        const mime = f.type || "application/octet-stream"
        const ref = await uploadFile("chat-attachments", `${threadId}/${id}/${safeName(f.name)}`, f)
        attachments.push({ id: actions.newId(), name: f.name, mime, size: f.size, kind: attachmentKind(mime), ref })
      }
      actions.sendMessage(threadId, draft, undefined, { id, attachments })
      setDraft("")
      setFiles([])
    } catch (e) {
      toast.error("Bilagan kunde inte skickas", { description: e instanceof Error ? e.message : undefined })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex-1 space-y-2 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">Inga meddelanden än. Säg hej!</p>
        )}
        {messages.map((m, i) => {
          const day = toISODate(new Date(m.sentAt))
          const showDay = i === 0 || toISODate(new Date(messages[i - 1].sentAt)) !== day
          const mine = m.senderId === meId
          const workout = m.workoutId ? data.workouts.find((w) => w.id === m.workoutId) : undefined
          return (
            <React.Fragment key={m.id}>
              {showDay && (
                <div className="py-2 text-center text-xs text-muted-foreground">{formatShort(day)}</div>
              )}
              <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl text-sm",
                    m.attachments?.length && !m.body ? "p-1.5" : "px-3.5 py-2",
                    mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted"
                  )}
                >
                  {workout && (
                    <div className="mb-1 flex items-center gap-1 text-xs opacity-80">
                      <Dumbbell className="size-3" /> {workout.name} · {formatShort(workout.date)}
                    </div>
                  )}
                  {m.attachments && m.attachments.length > 0 && (
                    <div className={cn("space-y-1.5", m.body && "mb-1.5")}>
                      {m.attachments.map((a) => (
                        <AttachmentView key={a.id} attachment={a} mine={mine} />
                      ))}
                    </div>
                  )}
                  {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                  <div className="mt-0.5 text-right text-[10px] opacity-70">{formatTime(m.sentAt)}</div>
                </div>
              </div>
            </React.Fragment>
          )
        })}
        <div ref={endRef} />
      </div>
      <form
        className="border-t p-3"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          addFiles(e.dataTransfer.files)
        }}
      >
        {files.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-2" aria-label="Bilagor att skicka">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex max-w-56 items-center gap-2 rounded-lg bg-muted py-1 pr-1 pl-2 text-xs">
                <PendingThumb file={f} />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="shrink-0 text-muted-foreground">{formatBytes(f.size)}</span>
                <button type="button" className="rounded p-0.5 hover:bg-background" aria-label={`Ta bort ${f.name}`} onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}>
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" multiple accept={ACCEPT["chat-attachments"]} className="sr-only" onChange={(e) => addFiles(e.target.files)} />
          <Button type="button" variant="ghost" size="icon" aria-label="Bifoga bild, video eller PDF" onClick={() => fileRef.current?.click()} disabled={sending}>
            <Paperclip />
          </Button>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            onPaste={(e) => e.clipboardData.files.length > 0 && addFiles(e.clipboardData.files)}
            placeholder="Skriv ett meddelande…"
            aria-label="Meddelande"
            rows={1}
            maxLength={2000}
            className="max-h-32 min-h-10 resize-none"
          />
          <Button type="submit" size="icon" aria-label="Skicka" disabled={(!draft.trim() && files.length === 0) || sending}>
            {sending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
          </Button>
        </div>
      </form>
    </div>
  )
}

/** Antal olästa meddelanden till `meId` i en tråd. */
export function useUnreadCount(meId: ID, threadIds?: ID[]) {
  const { data } = useAppData()
  return data.messages.filter(
    (m) => m.senderId !== meId && !m.readAt && (!threadIds || threadIds.includes(m.threadId))
  ).length
}

function PendingThumb({ file }: { file: File }) {
  const url = React.useMemo(() => (file.type.startsWith("image/") ? URL.createObjectURL(file) : null), [file])
  React.useEffect(() => () => {
    if (url) URL.revokeObjectURL(url)
  }, [url])
  // eslint-disable-next-line @next/next/no-img-element -- lokal förhandsvisning
  if (url) return <img src={url} alt="" className="size-7 rounded object-cover" />
  return <FileText className="size-4 shrink-0 text-muted-foreground" />
}
