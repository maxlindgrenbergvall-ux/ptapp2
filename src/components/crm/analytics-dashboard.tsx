"use client"

/**
 * Statistik, ekonomi och KPI:er (v82) – /admin/analytics, adminpanelens första
 * flik. Allt hämtas i ett anrop (get_admin_crm_analytics, bara admin). I
 * demoläget visas påhittade siffror. Alla rutor och grafer har fast höjd och
 * ritas som skelett medan datan laddas – inga layoutskiften.
 */
import {
  Activity,
  BadgePercent,
  CalendarClock,
  CircleDollarSign,
  Crown,
  Dumbbell,
  Info,
  Landmark,
  LineChart as LineIcon,
  RefreshCw,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react"
import * as React from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { demoAnalytics } from "@/lib/analytics/demo"
import {
  cumulativeSeries,
  deriveKpis,
  forecastMonth,
  monthTotals,
  normalizeAnalytics,
  sek,
  vatSummary,
  type Analytics,
  type Source,
} from "@/lib/analytics/finance"
import { getSupabase } from "@/lib/supabase/client"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import { cn } from "@/lib/utils"

// Paletten (samma som adminskalet): bakgrund, kort, kanter, text, accent.
const C = {
  bg: "#131916",
  card: "#1a221e",
  border: "#26322c",
  text: "#f9fbf8",
  muted: "#a3aba6",
  grid: "#26322c",
  lime: "#84cc16",
  blue: "#60a5fa",
  red: "#f87171",
  amber: "#fbbf24",
}

const PERIODS = [7, 30, 90] as const
const SOURCES: { id: Source; label: string }[] = [
  { id: "all", label: "Alla" },
  { id: "stripe", label: "Stripe" },
  { id: "revenuecat", label: "RevenueCat" },
]

const int = (n: number) => n.toLocaleString("sv-SE")
const pctText = (n: number | null) => (n === null ? "–" : `${n.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} %`)
const shortDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("sv-SE", { day: "numeric", month: "short", timeZone: "UTC" })
const monthLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("sv-SE", { month: "short", timeZone: "UTC" }).replace(".", "")
const kr = (n: number) => sek(Math.round(n))
const krAxis = (n: number) => (Math.abs(n) >= 1000 ? `${Math.round(n / 100) / 10}k` : String(Math.round(n)))

export function AnalyticsDashboard() {
  const [period, setPeriod] = React.useState<(typeof PERIODS)[number]>(30)
  const [source, setSource] = React.useState<Source>("all")
  const [data, setData] = React.useState<Analytics | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [version, setVersion] = React.useState(0)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    if (!isSupabaseEnabled) {
      // Demoläge: samma form som databasen.
      const id = window.setTimeout(() => {
        if (cancelled) return
        setData(normalizeAnalytics(demoAnalytics(period)))
        setLoading(false)
      }, 0)
      return () => {
        cancelled = true
        window.clearTimeout(id)
      }
    }
    void getSupabase()
      .rpc("get_admin_crm_analytics", { period_days: period })
      .then(({ data: raw, error: e }) => {
        if (cancelled) return
        setLoading(false)
        setError(e ? e.message : null)
        if (!e && raw) setData(normalizeAnalytics(raw))
      })
    return () => {
      cancelled = true
    }
  }, [period, version])

  const refresh = () => {
    setLoading(true)
    setVersion((v) => v + 1)
  }

  return (
    <div className="space-y-5 font-sans text-[#f9fbf8]" data-testid="analytics">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <LineIcon className="size-5 text-[#84cc16]" /> Statistik
          </h1>
          <p className="text-sm text-[#a3aba6]">
            Ekonomi, tillväxt och aktivitet. Ekonomin gäller {data ? `månaden som gått (${data.calendar.days_passed} av ${data.calendar.days_in_month} dagar)` : "innevarande månad"}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Källa" value={source} onChange={setSource} options={SOURCES} testId="analytics-source" />
          <Segmented
            label="Period"
            value={period}
            onChange={(p) => {
              setLoading(true)
              setPeriod(p)
            }}
            options={PERIODS.map((p) => ({ id: p, label: `${p} d` }))}
            testId="analytics-period"
          />
          <button
            type="button"
            onClick={refresh}
            aria-label="Uppdatera"
            className="flex size-9 items-center justify-center rounded-lg border border-[#26322c] text-[#a3aba6] transition-colors hover:text-[#f9fbf8] focus-visible:ring-2 focus-visible:ring-[#84cc16] focus-visible:outline-none"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          </button>
        </div>
      </header>

      {error && (
        <p role="alert" className="rounded-xl border border-[#f87171]/40 bg-[#f87171]/10 p-3 text-sm text-[#f87171]">
          Kunde inte hämta statistiken: {error}
        </p>
      )}

      <Body data={data} source={source} period={period} />
    </div>
  )
}

function Body({ data, source, period }: { data: Analytics | null; source: Source; period: number }) {
  const t = data ? monthTotals(data, source) : null
  const k = data ? deriveKpis(data, source) : null
  const forecast =
    data && t
      ? forecastMonth({
          oneOffSoFar: t.oneOff,
          recurringSoFar: t.recurring,
          remainingRenewals: t.remainingRenewals,
          daysPassed: data.calendar.days_passed,
          daysInMonth: data.calendar.days_in_month,
        })
      : null

  return (
    <>
      {/* ------------------------------------------------ huvudsiffror --- */}
      <section aria-label="Huvudsiffror" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          icon={CircleDollarSign}
          label="Intäkt denna månad"
          value={t ? kr(t.net) : null}
          sub={t ? `GMV ${kr(t.gmv)}${source !== "stripe" && t.storeFee > 0 ? ` · butiksavgift ${kr(t.storeFee)}` : ""}` : null}
          testId="kpi-revenue"
          accent
        />
        <Tile
          icon={TrendingUp}
          label="Prognos för månaden"
          value={forecast !== null ? kr(forecast) : null}
          sub={t ? `Engång ${kr(t.oneOff)} · förnyelser kvar ${kr(t.remainingRenewals)}` : null}
          testId="kpi-forecast"
          hint="(Engångsintäkter hittills ÷ dagar som gått) × dagar i månaden + återkommande hittills + kvarvarande förnyelser (ej uppsagda)."
        />
        <Tile icon={RefreshCw} label="MRR" value={t ? kr(t.mrr) : null} sub={data ? `${int(data.economy.mrr.subscriptions)} aktiva prenumerationer` : null} testId="kpi-mrr" />
        <Tile
          icon={Activity}
          label="Aktiva nu (15 min)"
          value={data ? int(data.activity.active_now.trainer + data.activity.active_now.client) : null}
          sub={data ? `${int(data.activity.active_now.trainer)} PT · ${int(data.activity.active_now.client)} klienter` : null}
          testId="kpi-active-now"
          live
        />
      </section>

      {/* --------------------------------- graf 1 + momsrutan ----------- */}
      <section className="grid gap-3 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Intäkt per dag, kumulativt"
          subtitle={source === "all" ? "Stripe + RevenueCat (netto)" : source === "stripe" ? "Stripe (inkl. moms)" : "RevenueCat (netto efter butiksavgift)"}
          legend={[
            { color: C.lime, label: "Faktiskt" },
            { color: C.lime, label: "Prognos", dashed: true },
            ...(source !== "revenuecat" ? [{ color: C.amber, label: "Varav moms (Stripe)" }] : []),
          ]}
        >
          {data ? <RevenueChart data={data} source={source} /> : <ChartSkeleton />}
        </Card>
        <VatCard data={data} source={source} />
      </section>

      {/* ------------------------------------------------------- KPI ---- */}
      <section aria-label="Nyckeltal" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Mini icon={Dumbbell} label="PT:er i Hitta PT" value={data ? int(data.kpis.pts.marketplace) : null} sub={data ? `${int(data.kpis.pts.onboarding)} i onboarding` : null} testId="kpi-pts" />
        <Mini icon={BadgePercent} label="PT-aktivering" value={k ? pctText(k.ptActivation) : null} sub={data ? `${int(data.kpis.pts.activated)} av ${int(data.kpis.pts.total)}` : null} />
        <Mini
          icon={Users}
          label="Klienter"
          value={data ? int(data.kpis.clients.total) : null}
          sub={data ? `${int(data.kpis.clients.paying_pt)} betalande PT · ${int(data.kpis.clients.free)} gratis` : null}
          testId="kpi-clients"
        />
        <Mini icon={Crown} label="Coavira+" value={data ? int(data.plus.active) : null} sub={k ? `konvertering ${pctText(k.plusConversion)}` : null} testId="kpi-plus" />
        <Mini
          icon={CalendarClock}
          label="Churn denna månad"
          value={k ? pctText(k.churn) : null}
          sub={data && k ? `${int(data.plus.churned_this_month)} avslutade · livslängd ${k.lifetimeMonths === null ? "–" : `${k.lifetimeMonths.toLocaleString("sv-SE")} mån`}` : null}
          testId="kpi-churn"
        />
        <Mini icon={Landmark} label="ARPU (månad)" value={k ? (k.arpu === null ? "–" : sek(k.arpu, 2)) : null} sub="nettointäkt ÷ MAU" />
        <Mini icon={UserPlus} label="Besök → konto" value={k ? pctText(k.landingToSignup) : null} sub={data ? `${int(data.traffic.funnel.signups)} konton · ${period} d` : null} testId="kpi-conversion" />
        <Mini icon={Activity} label="DAU" value={data ? int(data.activity.dau) : null} sub="aktiva i dag" />
        <Mini icon={Activity} label="WAU" value={data ? int(data.activity.wau) : null} sub="senaste 7 dagarna" />
        <Mini icon={Activity} label="MAU" value={data ? int(data.activity.mau) : null} sub="senaste 30 dagarna" />
        <Mini icon={UserPlus} label="Klick: Skapa konto" value={data ? int(data.traffic.totals.cta_signup) : null} sub={`${period} dagar`} />
        <Mini icon={UserPlus} label="Klick: Hitta PT" value={data ? int(data.traffic.totals.cta_find_pt) : null} sub={`${period} dagar`} />
      </section>

      {/* ----------------------------------------- graf 2 + tratten ----- */}
      <section className="grid gap-3 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Besökare på landningssidan"
          subtitle={data ? `${int(data.traffic.totals.visitors)} unika besökare · ${int(data.traffic.totals.views)} sidvisningar · ${period} dagar` : `${period} dagar`}
          legend={[
            { color: C.lime, label: "Unika besökare" },
            { color: C.blue, label: "Sidvisningar" },
          ]}
        >
          {data ? <TrafficChart data={data} /> : <ChartSkeleton />}
        </Card>
        <FunnelCard data={data} period={period} />
      </section>

      {/* ------------------------------------- graf 3, 4 och 5 ---------- */}
      <section className="grid gap-3 lg:grid-cols-2">
        <Card
          title="Dagligt aktiva användare"
          subtitle="30 dagar"
          legend={[
            { color: C.lime, label: "PT:er" },
            { color: C.blue, label: "Klienter" },
          ]}
        >
          {data ? <DauChart data={data} /> : <ChartSkeleton />}
        </Card>
        <GrowthCard data={data} />
      </section>
      <section className="grid gap-3 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Coavira+ – nya och avslutade per månad"
          subtitle="Nya uppåt, avslutade (churn) nedåt"
          legend={[
            { color: C.lime, label: "Nya" },
            { color: C.red, label: "Avslutade" },
          ]}
        >
          {data ? <PlusChart data={data} /> : <ChartSkeleton />}
        </Card>
        <SourcesCard data={data} period={period} />
      </section>
      <p className="text-xs text-[#a3aba6]">
        Besök räknas utan cookies (en hash av datum, IP och webbläsare som byts varje dygn). Sandbox-köp och återbetalningar räknas inte.
        {data && ` Uppdaterad ${new Date(data.generated_at).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}.`}
      </p>
    </>
  )
}

// =================================================================== delar ===

function Segmented<T extends string | number>({
  label,
  value,
  onChange,
  options,
  testId,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: { id: T; label: string }[]
  testId?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg border border-[#26322c] bg-[#1a221e] p-0.5 text-sm" data-testid={testId}>
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={String(o.id)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className={cn(
              "h-8 rounded-md px-3 font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[#84cc16] focus-visible:outline-none",
              on ? "bg-[#84cc16] text-[#131916]" : "text-[#a3aba6] hover:text-[#f9fbf8]"
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function Skel({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block animate-pulse rounded-md bg-[#26322c]", className)} />
}

function Tile({
  icon: Icon,
  label,
  value,
  sub,
  testId,
  accent,
  live,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | null
  sub: string | null
  testId?: string
  accent?: boolean
  live?: boolean
  hint?: string
}) {
  return (
    <div className="flex h-[118px] flex-col justify-between rounded-2xl border border-[#26322c] bg-[#1a221e] p-4" data-testid={testId}>
      <div className="flex items-center gap-2 text-[13px] text-[#a3aba6]">
        <Icon className={cn("size-4", accent && "text-[#84cc16]")} />
        <span className="truncate">{label}</span>
        {live && <span aria-hidden className="ml-auto size-2 animate-pulse rounded-full bg-[#84cc16]" />}
        {hint && (
          <span className="ml-auto" title={hint} aria-label={hint}>
            <Info className="size-3.5" />
          </span>
        )}
      </div>
      {value === null ? <Skel className="h-8 w-32" /> : <p className="text-[1.65rem] leading-none font-semibold tracking-tight tabular-nums" data-value>{value}</p>}
      {sub === null ? <Skel className="h-3.5 w-40" /> : <p className="truncate text-xs text-[#a3aba6] tabular-nums">{sub}</p>}
    </div>
  )
}

function Mini({
  icon: Icon,
  label,
  value,
  sub,
  testId,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | null
  sub: string | null
  testId?: string
}) {
  return (
    <div className="flex h-[96px] flex-col justify-between rounded-xl border border-[#26322c] bg-[#1a221e] p-3" data-testid={testId}>
      <p className="flex items-center gap-1.5 truncate text-xs text-[#a3aba6]">
        <Icon className="size-3.5 shrink-0" /> {label}
      </p>
      {value === null ? <Skel className="h-6 w-20" /> : <p className="text-xl leading-none font-semibold tabular-nums" data-value>{value}</p>}
      {sub === null ? <Skel className="h-3 w-24" /> : <p className="truncate text-[11px] text-[#a3aba6] tabular-nums">{sub}</p>}
    </div>
  )
}

type LegendItem = { color: string; label: string; dashed?: boolean }

function Card({
  title,
  subtitle,
  legend,
  className,
  children,
  actions,
}: {
  title: string
  subtitle?: string
  legend?: LegendItem[]
  className?: string
  children: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <section className={cn("flex flex-col rounded-2xl border border-[#26322c] bg-[#1a221e] p-4", className)} aria-label={title}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && <p className="truncate text-xs text-[#a3aba6]">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {legend && legend.length > 1 && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#a3aba6]">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-0.5 w-4 rounded-full" style={l.dashed ? { backgroundImage: `linear-gradient(90deg, ${l.color} 50%, transparent 50%)`, backgroundSize: "6px 2px" } : { background: l.color }} />
              {l.label}
            </li>
          ))}
        </ul>
      )}
      {children}
    </section>
  )
}

function ChartSkeleton() {
  return <Skel className="h-64 w-full" />
}

const axisProps = {
  stroke: C.muted,
  tick: { fill: C.muted, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const

type TipEntry = { dataKey?: unknown; name?: unknown; value?: unknown; color?: string }
function ChartTooltip({ active, payload, label, format }: { active?: boolean; payload?: readonly TipEntry[]; label: string; format?: (v: number) => string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-[#26322c] bg-[#131916]/95 px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-[#f9fbf8]">{String(label)}</p>
      {payload
        .filter((p) => p.value !== null && p.value !== undefined)
        .map((p) => (
          <p key={String(p.dataKey)} className="flex items-center gap-2 text-[#a3aba6]">
            <span aria-hidden className="size-2 rounded-full" style={{ background: p.color ?? C.lime }} />
            {String(p.name)}: <span className="font-medium text-[#f9fbf8] tabular-nums">{format ? format(Math.abs(Number(p.value))) : int(Math.abs(Number(p.value)))}</span>
          </p>
        ))}
    </div>
  )
}

// ================================================================= graferna ===

function RevenueChart({ data, source }: { data: Analytics; source: Source }) {
  const series = React.useMemo(() => cumulativeSeries(data, source), [data, source])
  return (
    <div className="h-64" role="img" aria-label="Kumulativ intäkt per dag med prognos för resten av månaden">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.lime} stopOpacity={0.28} />
              <stop offset="100%" stopColor={C.lime} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="day" {...axisProps} interval="preserveStartEnd" minTickGap={18} />
          <YAxis {...axisProps} tickFormatter={krAxis} width={48} />
          <Tooltip
            cursor={{ stroke: C.border }}
            content={(p) => <ChartTooltip active={p.active} payload={p.payload as readonly TipEntry[] | undefined} label={`${p.label} ${monthLabel(data.calendar.month_start)}`} format={kr} />}
          />
          <ReferenceLine x={data.calendar.days_passed} stroke={C.border} strokeDasharray="2 4" />
          <Area type="monotone" dataKey="actual" name="Faktiskt" stroke={C.lime} strokeWidth={2} fill="url(#rev-fill)" isAnimationActive={false} connectNulls={false} />
          <Line type="linear" dataKey="forecast" name="Prognos" stroke={C.lime} strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
          {source !== "revenuecat" && (
            <Line type="monotone" dataKey="vat" name="Varav moms" stroke={C.amber} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function TrafficChart({ data }: { data: Analytics }) {
  return (
    <div className="h-64" role="img" aria-label="Unika besökare och sidvisningar per dag">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data.traffic.daily} margin={{ top: 6, right: 8, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="traffic-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.lime} stopOpacity={0.25} />
              <stop offset="100%" stopColor={C.lime} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="date" {...axisProps} tickFormatter={shortDate} minTickGap={28} />
          <YAxis {...axisProps} width={44} allowDecimals={false} />
          <Tooltip cursor={{ stroke: C.border }} content={(p) => <ChartTooltip active={p.active} payload={p.payload as readonly TipEntry[] | undefined} label={shortDate(String(p.label))} />} />
          <Line type="monotone" dataKey="views" name="Sidvisningar" stroke={C.blue} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Area type="monotone" dataKey="visitors" name="Unika besökare" stroke={C.lime} strokeWidth={2} fill="url(#traffic-fill)" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function DauChart({ data }: { data: Analytics }) {
  return (
    <div className="h-64" role="img" aria-label="Dagligt aktiva PT:er och klienter, 30 dagar">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data.activity.daily} margin={{ top: 6, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="date" {...axisProps} tickFormatter={shortDate} minTickGap={28} />
          <YAxis {...axisProps} width={44} allowDecimals={false} />
          <Tooltip cursor={{ stroke: C.border }} content={(p) => <ChartTooltip active={p.active} payload={p.payload as readonly TipEntry[] | undefined} label={shortDate(String(p.label))} />} />
          <Line type="monotone" dataKey="client" name="Klienter" stroke={C.blue} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="trainer" name="PT:er" stroke={C.lime} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function GrowthCard({ data }: { data: Analytics | null }) {
  const [by, setBy] = React.useState<"weekly" | "monthly">("weekly")
  const rows = data ? data.growth[by] : []
  return (
    <Card
      title="Nya konton"
      subtitle={by === "weekly" ? "Per vecka, 12 veckor" : "Per månad, 12 månader"}
      legend={[
        { color: C.lime, label: "PT:er" },
        { color: C.blue, label: "Klienter" },
      ]}
      actions={
        <Segmented
          label="Gruppera"
          value={by}
          onChange={setBy}
          options={[
            { id: "weekly", label: "Vecka" },
            { id: "monthly", label: "Månad" },
          ]}
        />
      }
    >
      {data ? (
        <div className="h-64" role="img" aria-label="Nya PT:er och klienter per period">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: -16 }} barGap={2} barCategoryGap="22%">
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="period" {...axisProps} tickFormatter={by === "weekly" ? shortDate : monthLabel} minTickGap={8} />
              <YAxis {...axisProps} width={44} allowDecimals={false} />
              <Tooltip cursor={{ fill: "rgb(249 251 248 / 4%)" }} content={(p) => <ChartTooltip active={p.active} payload={p.payload as readonly TipEntry[] | undefined} label={by === "weekly" ? `Vecka från ${shortDate(String(p.label))}` : monthLabel(String(p.label))} />} />
              <Bar dataKey="trainer" name="PT:er" fill={C.lime} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="client" name="Klienter" fill={C.blue} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <ChartSkeleton />
      )}
    </Card>
  )
}

function PlusChart({ data }: { data: Analytics }) {
  const rows = data.plus.monthly.map((m) => ({ period: m.period, new: m.new, churned: -m.churned }))
  return (
    <div className="h-64" role="img" aria-label="Nya och avslutade Coavira+-medlemmar per månad">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: -16 }} stackOffset="sign" barCategoryGap="28%">
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="period" {...axisProps} tickFormatter={monthLabel} />
          <YAxis {...axisProps} width={44} allowDecimals={false} tickFormatter={(v: number) => String(Math.abs(v))} />
          <ReferenceLine y={0} stroke={C.muted} strokeOpacity={0.5} />
          <Tooltip cursor={{ fill: "rgb(249 251 248 / 4%)" }} content={(p) => <ChartTooltip active={p.active} payload={p.payload as readonly TipEntry[] | undefined} label={monthLabel(String(p.label))} />} />
          <Bar dataKey="new" name="Nya" stackId="plus" fill={C.lime} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="churned" name="Avslutade" stackId="plus" fill={C.red} radius={[0, 0, 4, 4]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ============================================================== övriga kort ===

function VatCard({ data, source }: { data: Analytics | null; source: Source }) {
  const [period, setPeriod] = React.useState<"month" | "quarter" | "year">("month")
  const v = data ? vatSummary(data.economy.vat_periods[period]) : null
  const showStripe = source !== "revenuecat"
  const showRc = source !== "stripe"
  return (
    <Card
      title="Moms"
      subtitle="Underlag för momsdeklarationen"
      actions={
        <Segmented
          label="Momsperiod"
          value={period}
          onChange={setPeriod}
          options={[
            { id: "month", label: "Månad" },
            { id: "quarter", label: "Kvartal" },
            { id: "year", label: "År" },
          ]}
          testId="vat-period"
        />
      }
    >
      <div className="flex h-64 flex-col gap-3" data-testid="vat-card">
        <div className={cn("rounded-xl border border-[#26322c] p-3", !showStripe && "opacity-40")}>
          <p className="text-xs font-medium text-[#a3aba6]">Stripe – Coavira säljer (25 % moms)</p>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
            <Stat label="Brutto" value={v ? kr(v.stripeGross) : null} />
            <Stat label="Utgående moms" value={v ? kr(v.stripeVat) : null} highlight testId="vat-out" />
            <Stat label="Netto exkl. moms" value={v ? kr(v.stripeNetExVat) : null} />
          </dl>
        </div>
        <div className={cn("rounded-xl border border-[#26322c] p-3", !showRc && "opacity-40")}>
          <p className="text-xs font-medium text-[#a3aba6]">RevenueCat – App Store och Google Play</p>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <Stat label="Netto till Coavira" value={v ? kr(v.revenuecatNet) : null} />
            <Stat label="Moms" value={v ? "0 kr" : null} />
          </dl>
          <p className="mt-2 text-[11px] leading-snug text-[#a3aba6]">MoR – moms hanteras av Apple/Google, omvänd skattskyldighet.</p>
        </div>
        <p className="mt-auto text-[11px] leading-snug text-[#a3aba6]">Moms = Brutto − Brutto ÷ 1,25. Återbetalda köp är borträknade.</p>
      </div>
    </Card>
  )
}

function Stat({ label, value, highlight, testId }: { label: string; value: string | null; highlight?: boolean; testId?: string }) {
  return (
    <div className="min-w-0" data-testid={testId}>
      <dt className="truncate text-[11px] text-[#a3aba6]">{label}</dt>
      <dd className={cn("truncate font-semibold tabular-nums", highlight && "text-[#84cc16]")}>{value ?? <Skel className="mt-1 h-4 w-16" />}</dd>
    </div>
  )
}

function FunnelCard({ data, period }: { data: Analytics | null; period: number }) {
  const steps = data
    ? [
        { label: "Besökare", value: data.traffic.totals.visitors },
        { label: "Skapat konto", value: data.traffic.funnel.signups },
        { label: "Bokat PT", value: data.traffic.funnel.booked_pt },
        { label: "Coavira+", value: data.traffic.funnel.plus },
      ]
    : null
  const top = steps ? Math.max(1, steps[0].value) : 1
  return (
    <Card title="Tratt" subtitle={`${period} dagar`}>
      <ol className="flex h-64 flex-col justify-between gap-2" data-testid="funnel">
        {(steps ?? Array.from({ length: 4 }, (_, i) => ({ label: ["Besökare", "Skapat konto", "Bokat PT", "Coavira+"][i], value: -1 }))).map((s, i, all) => {
          const width = s.value < 0 ? 0 : Math.max(3, (s.value / top) * 100)
          // Bokat PT och Coavira+ är två parallella steg efter kontot – båda räknas mot kontona.
          const prev = i === 0 ? null : all[Math.min(i - 1, 1)].value
          const conv = prev && prev > 0 && s.value >= 0 ? Math.round((s.value / prev) * 1000) / 10 : null
          return (
            <li key={s.label} className="space-y-1">
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-[#a3aba6]">{s.label}</span>
                <span className="tabular-nums">
                  {s.value < 0 ? <Skel className="inline-block h-3 w-10" /> : <span className="font-semibold">{int(s.value)}</span>}
                  {conv !== null && <span className="ml-1.5 text-[#a3aba6]">({conv.toLocaleString("sv-SE")} %)</span>}
                </span>
              </div>
              <div className="h-7 rounded-md bg-[#131916]">
                <div className="h-full rounded-md bg-[#84cc16] transition-[width] duration-500" style={{ width: `${width}%`, opacity: 1 - i * 0.18 }} />
              </div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

function SourcesCard({ data, period }: { data: Analytics | null; period: number }) {
  const rows = data?.traffic.sources ?? null
  const top = rows?.length ? Math.max(...rows.map((r) => r.visitors)) : 1
  return (
    <Card title="Varifrån besökarna kommer" subtitle={`UTM-källa eller hänvisande sajt · ${period} dagar`}>
      <ul className="flex h-64 flex-col gap-2.5">
        {rows === null &&
          Array.from({ length: 5 }, (_, i) => (
            <li key={i}>
              <Skel className="h-8 w-full" />
            </li>
          ))}
        {rows?.length === 0 && <li className="text-sm text-[#a3aba6]">Inga besök än.</li>}
        {rows?.map((r) => (
          <li key={r.source} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="truncate">{r.source}</span>
              <span className="text-[#a3aba6] tabular-nums">{int(r.visitors)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-[#131916]">
              <div className="h-full rounded-full bg-[#60a5fa]" style={{ width: `${Math.max(2, (r.visitors / top) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
