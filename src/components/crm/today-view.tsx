"use client"

import { AtSign, CalendarClock, CheckCheck, ChevronRight, Flame, Mail, MessageCircle, PhoneCall, Scale, Send, UserPlus, type LucideIcon } from "lucide-react"
import * as React from "react"

import { EmptyState } from "@/components/common"
import { CompanyFormBadge, ScoreBadge } from "@/components/crm/parts"
import { Button } from "@/components/ui/button"
import { todoList, type ActionKind, type NextAction } from "@/lib/crm/next-action"
import type { Activity, EmailLog, Lead } from "@/lib/crm/types"
import { cn } from "@/lib/utils"

const ICON: Record<ActionKind, LucideIcon> = {
  reminder: CalendarClock,
  book_call: PhoneCall,
  prep_call: CalendarClock,
  log_call: CheckCheck,
  convert: UserPlus,
  assess: Scale,
  dm: AtSign,
  email: Mail,
  follow_up: MessageCircle,
  none: ChevronRight,
}

/**
 * "Att göra" (v53): varje lead med något att göra, viktigast först – svar som
 * väntar på en bokning, samtal att förbereda eller logga, påminnelser, och
 * nya leads att kontakta i rätt kanal. Ett klick öppnar leaden; mejl kan
 * köas direkt för flera på en gång.
 */
export function TodayView({
  leads,
  logs,
  activities,
  compact = false,
  onOpen,
  onEmail,
  onShowAll,
}: {
  leads: Lead[]
  logs: EmailLog[]
  activities: Activity[]
  compact?: boolean
  onOpen: (id: string) => void
  onEmail: (ids: string[]) => void
  onShowAll?: () => void
}) {
  // Tiden läses en gång per rendering av listan (inte i varje rad).
  const [now] = React.useState(() => new Date())
  const items = React.useMemo(() => todoList(leads, { logs, activities, now }), [leads, logs, activities, now])
  const due = items.filter((i) => i.action.due)
  const shown = compact ? due.slice(0, 5) : items
  const emailIds = items.filter((i) => i.action.kind === "email").map((i) => i.lead.id)

  if (compact && !due.length) return null
  return (
    <section className={cn("space-y-3", compact && "rounded-2xl border border-primary/25 bg-primary/[0.04] p-4")} aria-labelledby="todo-title" data-testid={compact ? "todo-compact" : "todo"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="todo-title" className="flex items-center gap-2 font-semibold">
          <Flame className="size-4 text-primary" aria-hidden /> Att göra {compact ? "idag" : ""}
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary tabular">{due.length}</span>
        </h2>
        <div className="flex items-center gap-2">
          {!compact && emailIds.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => onEmail(emailIds)} data-testid="todo-email-all">
              <Send /> Förhandsgranska {emailIds.length} första mejl
            </Button>
          )}
          {compact && onShowAll && items.length > shown.length && (
            <Button size="sm" variant="ghost" onClick={onShowAll} data-testid="todo-show-all">
              Visa alla {items.length} <ChevronRight />
            </Button>
          )}
        </div>
      </div>
      {!compact && items.length === 0 ? (
        <EmptyState icon={CheckCheck} tone="done" title="Inget att göra just nu" text="Alla svar är bokade, samtal loggade och nya leads kontaktade. Hitta fler PT:er eller kom tillbaka i morgon." />
      ) : (
        <ul className="space-y-1.5" data-testid="todo-list">
          {shown.map(({ lead, action }, i) => (
            <TodoRow key={lead.id} lead={lead} action={action} index={i} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </section>
  )
}

function TodoRow({ lead, action, index, onOpen }: { lead: Lead; action: NextAction; index: number; onOpen: (id: string) => void }) {
  const Icon = ICON[action.kind]
  return (
    <li className="rise-in" style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}>
      <button
        type="button"
        onClick={() => onOpen(lead.id)}
        className="group flex w-full items-center gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5 text-left transition-[border-color,background-color,transform] duration-200 hover:border-primary/50 hover:bg-primary/[0.05] active:scale-[0.995]"
        data-testid="todo-row"
        data-action={action.kind}
      >
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", action.due ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{action.label}</span>
            {action.hot && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary" data-testid="hot">
                <Flame className="size-3" aria-hidden /> Het
              </span>
            )}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate font-medium text-foreground/80">{lead.name}</span>
            <CompanyFormBadge form={lead.companyForm} className="h-4 min-w-6 text-[9px]" />
            <span className="truncate">· {action.reason}</span>
          </span>
        </span>
        <ScoreBadge score={lead.score} className="hidden shrink-0 sm:inline-flex" />
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
      </button>
    </li>
  )
}
