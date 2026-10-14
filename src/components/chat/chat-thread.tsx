"use client"

import { Dumbbell, SendHorizontal } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useAppData } from "@/lib/data/store"
import { formatShort, formatTime, toISODate } from "@/lib/date"
import { cn } from "@/lib/utils"
import type { ID } from "@/types/domain"

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
  const endRef = React.useRef<HTMLDivElement>(null)

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

  const send = () => {
    if (!draft.trim()) return
    actions.sendMessage(threadId, draft)
    setDraft("")
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
                    "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
                    mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted"
                  )}
                >
                  {workout && (
                    <div className="mb-1 flex items-center gap-1 text-xs opacity-80">
                      <Dumbbell className="size-3" /> {workout.name} · {formatShort(workout.date)}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <div className="mt-0.5 text-right text-[10px] opacity-70">{formatTime(m.sentAt)}</div>
                </div>
              </div>
            </React.Fragment>
          )
        })}
        <div ref={endRef} />
      </div>
      <form
        className="flex items-end gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Skriv ett meddelande…"
          aria-label="Meddelande"
          rows={1}
          maxLength={2000}
          className="max-h-32 min-h-10 resize-none"
        />
        <Button type="submit" size="icon" aria-label="Skicka" disabled={!draft.trim()}>
          <SendHorizontal />
        </Button>
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
