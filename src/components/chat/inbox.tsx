"use client"

import { ArrowLeft, CheckCheck, ChevronRight } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { CallButtons } from "@/components/calls/call-buttons"
import { ChatThread } from "@/components/chat/chat-thread"
import { EmptyState, PersonAvatar } from "@/components/common"
import { Button } from "@/components/ui/button"
import { callThread } from "@/lib/calls/thread"
import { unreadTotal, type InboxThread } from "@/lib/chat/inbox"
import { formatShort, formatTime, toISODate } from "@/lib/date"
import { cn } from "@/lib/utils"

/** Tid i inkorgen: klockslag idag, annars datum. */
function when(iso: string) {
  return toISODate(new Date(iso)) === toISODate(new Date()) ? formatTime(iso) : formatShort(toISODate(new Date(iso)))
}

/**
 * Inkorgen (v42): en rad per konversation. Olästa ligger överst, står i fetstil
 * och har en bricka med antalet. Ett tryck öppnar konversationen
 * (/klient/chatt/[pt] eller /pt/meddelanden/[klient]) där man läser och svarar.
 */
export function ChatInbox({ rows, activeKey, empty, className }: { rows: InboxThread[]; activeKey?: string; empty?: React.ReactNode; className?: string }) {
  const [onlyUnread, setOnlyUnread] = React.useState(false)
  const total = unreadTotal(rows)
  const shown = onlyUnread ? rows.filter((r) => r.unread > 0) : rows

  if (rows.length === 0) return <>{empty}</>
  return (
    <div className={cn("min-w-0 space-y-3", className)} data-testid="chat-inbox">
      <div className="flex gap-1.5" role="group" aria-label="Filtrera konversationer">
        <FilterChip active={!onlyUnread} onClick={() => setOnlyUnread(false)}>
          Alla
        </FilterChip>
        <FilterChip active={onlyUnread} onClick={() => setOnlyUnread(true)}>
          Olästa{total > 0 ? ` (${total})` : ""}
        </FilterChip>
      </div>
      <ul className="divide-y overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card" aria-label="Konversationer">
        {shown.map((r) => (
          <li key={r.key}>
            <Link
              href={r.href}
              aria-current={r.key === activeKey ? "page" : undefined}
              aria-label={`${r.peer.name}${r.unread ? `, ${r.unread} olästa` : ""}: ${r.preview}`}
              className={cn(
                "flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60 active:bg-muted",
                r.key === activeKey && "bg-muted",
                r.unread > 0 && "bg-primary/[0.04]"
              )}
              data-testid="inbox-row"
              data-unread={r.unread || undefined}
            >
              <span className="relative shrink-0">
                <PersonAvatar name={r.peer.name} src={r.peer.avatarUrl} className="size-11" />
                {r.unread > 0 && <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-brand ring-2 ring-card" aria-hidden />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn("truncate text-sm", r.unread ? "font-semibold" : "font-medium")}>{r.peer.name}</span>
                  {r.last && <span className={cn("shrink-0 text-xs tabular", r.unread ? "font-semibold text-primary" : "text-muted-foreground")}>{when(r.last.sentAt)}</span>}
                </span>
                <span className="mt-0.5 flex items-center gap-2">
                  <span className={cn("min-w-0 flex-1 truncate text-xs", r.unread ? "font-medium text-foreground" : "text-muted-foreground")} data-testid="inbox-preview">
                    {r.pending ? "Väntar på att förfrågan accepteras" : r.preview}
                  </span>
                  {r.unread > 0 && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-brand-foreground tabular" data-testid="inbox-unread">
                      {r.unread > 99 ? "99+" : r.unread}
                    </span>
                  )}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
            </Link>
          </li>
        ))}
        {shown.length === 0 && (
          <li>
            <EmptyState
              compact
              tone="done"
              icon={CheckCheck}
              title="Inga olästa meddelanden."
              text="Du är i kapp – allt är läst."
              action={
                <Button variant="outline" size="sm" onClick={() => setOnlyUnread(false)}>
                  Visa alla konversationer
                </Button>
              }
            />
          </li>
        )}
      </ul>
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-9 rounded-full border px-3.5 text-xs font-medium transition-colors",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted/60"
      )}
    >
      {children}
    </button>
  )
}

/**
 * Konversationen (v42): ren chattvy i helskärm på mobilen – tillbaka-pil,
 * motpartens namn och samtalsknappar överst, meddelandena i mitten och
 * skrivfältet längst ned (ovanför hemindikatorn). Meddelandena markeras som
 * lästa när vyn öppnas (ChatThread → markThreadRead).
 */
export function ConversationView({
  thread,
  meId,
  backHref,
  peerHref,
  subtitle,
  className,
}: {
  thread: InboxThread
  meId: string
  backHref: string
  /** Länk från namnet (PT → klientens sida). */
  peerHref?: string
  subtitle?: React.ReactNode
  className?: string
}) {
  const { peer, pending } = thread
  return (
    <div className={cn("flex min-h-0 min-w-0 flex-col bg-background max-lg:page-push", className)} data-testid="conversation">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-2 py-2 pt-[calc(0.5rem+var(--safe-top))] lg:pt-2">
        <Button asChild variant="ghost" size="icon" aria-label="Tillbaka till inkorgen">
          <Link href={backHref}>
            <ArrowLeft />
          </Link>
        </Button>
        <PersonAvatar name={peer.name} src={peer.avatarUrl} className="size-9" />
        <div className="min-w-0 flex-1">
          {peerHref ? (
            <Link href={peerHref} className="block truncate font-semibold hover:underline">
              {peer.name}
            </Link>
          ) : (
            <p className="truncate font-semibold">{peer.name}</p>
          )}
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <span className={cn("size-1.5 shrink-0 rounded-full", pending ? "bg-warning" : "bg-success")} aria-hidden />
            {pending ? "Väntar på att förfrågan accepteras" : subtitle}
          </p>
        </div>
        <CallButtons threadId={callThread(thread.threadId, thread.trainerId)} peerId={peer.id} peerName={peer.name} disabled={pending} />
      </div>
      <ChatThread
        key={thread.key}
        threadId={thread.threadId}
        trainerId={thread.trainerId}
        meId={meId}
        peer={pending ? undefined : { id: peer.id, name: peer.name }}
        className="flex-1 pb-[var(--safe-bottom)] lg:pb-0"
      />
    </div>
  )
}
