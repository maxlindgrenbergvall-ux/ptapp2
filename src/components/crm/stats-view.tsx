"use client"

import { AtSign, Info, Mail, PhoneCall, Reply, UserPlus } from "lucide-react"
import * as React from "react"

import { AnimatedNumber, FillBar } from "@/components/motion"
import { crmStats } from "@/lib/crm/stats"
import type { Activity, EmailLog, EmailTemplate, Lead } from "@/lib/crm/types"
import { cn } from "@/lib/utils"

const pct = (n: number | null) => (n === null ? "–" : `${n} %`)

/**
 * Konverteringsstatistik (v53): tratten från kontaktad till registrerad PT,
 * svar per mall (det som säger vilken mall som fungerar), Instagram-DM och
 * uppföljningar. Öppningsgrad visas bara om öppningar faktiskt spåras.
 */
export function StatsView({ leads, logs, activities, templates }: { leads: Lead[]; logs: EmailLog[]; activities: Activity[]; templates: EmailTemplate[] }) {
  const st = React.useMemo(() => crmStats(leads, logs, activities, templates), [leads, logs, activities, templates])
  const steps = [
    { key: "contacted", label: "Kontaktade", icon: Mail, value: st.funnel.contacted },
    { key: "replied", label: "Svarat", icon: Reply, value: st.funnel.replied, rate: st.rates.reply },
    { key: "meetings", label: "Bokade samtal", icon: PhoneCall, value: st.funnel.meetings, rate: st.rates.meeting },
    { key: "converted", label: "Registrerade PT:er", icon: UserPlus, value: st.funnel.converted, rate: st.rates.conversion },
  ]
  const top = Math.max(1, st.funnel.contacted)
  return (
    <div className="space-y-6" data-testid="stats">
      <section className="space-y-3 rounded-2xl border border-border/70 bg-card p-5 shadow-card" aria-labelledby="funnel-title">
        <h2 id="funnel-title" className="font-semibold">
          Tratten
        </h2>
        <ol className="space-y-3" data-testid="funnel">
          {steps.map((s, i) => (
            <li key={s.key} className="rise-in space-y-1.5" style={{ animationDelay: `${i * 70}ms` }} data-step={s.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <s.icon className="size-4 text-muted-foreground" aria-hidden /> {s.label}
                </span>
                <span className="tabular">
                  <span className="font-semibold">
                    <AnimatedNumber value={s.value} />
                  </span>
                  {s.rate !== undefined && <span className="ml-2 text-xs text-muted-foreground">{pct(s.rate)} av kontaktade</span>}
                </span>
              </div>
              <FillBar value={(s.value / top) * 100} className="h-2" barClassName={cn(i === steps.length - 1 && "bg-primary", i < steps.length - 1 && "bg-primary/70")} aria-hidden />
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-3" aria-labelledby="tpl-title">
        <h2 id="tpl-title" className="font-semibold">
          Per mall
        </h2>
        {st.templates.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">Inga mejl skickade än.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card">
            <table className="w-full min-w-[620px] text-sm tabular" data-testid="template-stats">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Mall</th>
                  <th className="px-3 py-2.5 text-right font-medium">Skickade</th>
                  <th className="px-3 py-2.5 text-right font-medium">Levererade</th>
                  {st.opensTracked && <th className="px-3 py-2.5 text-right font-medium">Öppnade</th>}
                  <th className="px-3 py-2.5 text-right font-medium">Svar</th>
                  <th className="px-3 py-2.5 text-right font-medium">Samtal</th>
                  <th className="px-4 py-2.5 text-right font-medium">PT:er</th>
                </tr>
              </thead>
              <tbody>
                {st.templates.map((t) => (
                  <tr key={t.templateId} className="border-b border-border/50 last:border-0" data-testid="template-stat">
                    <td className="max-w-56 truncate px-4 py-2.5 font-medium">{t.name}</td>
                    <td className="px-3 py-2.5 text-right">{t.sent}</td>
                    <td className="px-3 py-2.5 text-right">
                      {t.delivered}
                      {t.bounced > 0 && <span className="ml-1 text-xs text-destructive">({t.bounced} studs)</span>}
                    </td>
                    {st.opensTracked && <td className="px-3 py-2.5 text-right">{pct(t.openRate)}</td>}
                    <td className="px-3 py-2.5 text-right">
                      <span className={cn("font-semibold", (t.replyRate ?? 0) >= 15 && "text-primary")}>{pct(t.replyRate)}</span>
                      <span className="ml-1 text-xs text-muted-foreground">({t.replied})</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">{t.meetings}</td>
                    <td className="px-4 py-2.5 text-right">{t.converted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!st.opensTracked && (
          <p className="flex gap-2 text-xs leading-relaxed text-muted-foreground" data-testid="opens-note">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Öppningsgrad visas inte: mejlen har inga spårpixlar. Enligt IMY kräver spårning i mejl samtycke, och svarsfrekvensen säger mer om vad som fungerar.
          </p>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <MiniStat icon={AtSign} title="Instagram-DM" lines={[`${st.dm.sent} skickade`, `${st.dm.replied} svar`, `Svarsfrekvens ${pct(st.dm.replyRate)}`]} testId="dm-stats" />
        <MiniStat icon={Reply} title="Automatiska uppföljningar" lines={[`${st.followups.sent} skickade`, `${st.followups.cancelled} pausade (svar eller bokning)`]} testId="followup-stats" />
      </div>
    </div>
  )
}

function MiniStat({ icon: Icon, title, lines, testId }: { icon: typeof Mail; title: string; lines: string[]; testId: string }) {
  return (
    <div className="space-y-1.5 rounded-2xl border border-border/70 bg-card p-4 shadow-card" data-testid={testId}>
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-primary" aria-hidden /> {title}
      </p>
      {lines.map((l) => (
        <p key={l} className="text-sm text-muted-foreground tabular">
          {l}
        </p>
      ))}
    </div>
  )
}
