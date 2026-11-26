/**
 * Adminstatistiken (v82): typer för get_admin_crm_analytics() och de rena
 * beräkningarna ovanpå – prognos, moms, konverteringar, churn och ARPU.
 */

export type Source = "all" | "stripe" | "revenuecat"

export type ProviderMonth = {
  gross: number
  store_fee: number
  net: number
  vat: number
  gmv: number
  one_off_net: number
  recurring_net: number
  count: number
}

export type VatPeriod = {
  from: string
  stripe_gross: number
  stripe_vat: number
  revenuecat_gross: number
  revenuecat_net: number
}

export type DailyRevenue = {
  date: string
  stripe_net: number
  stripe_gross: number
  stripe_vat: number
  revenuecat_net: number
  revenuecat_gross: number
  gmv: number
}

export type Analytics = {
  generated_at: string
  period_days: number
  calendar: { today: string; month_start: string; month_end: string; days_in_month: number; days_passed: number; quarter_start: string; year_start: string }
  economy: {
    month: { stripe: ProviderMonth; revenuecat: ProviderMonth }
    vat_periods: { month: VatPeriod; quarter: VatPeriod; year: VatPeriod }
    mrr: { stripe: number; revenuecat: number; subscriptions: number }
    remaining_renewals: { stripe: number; revenuecat: number }
    daily: DailyRevenue[]
  }
  traffic: {
    daily: { date: string; visitors: number; views: number }[]
    totals: { visitors: number; views: number; cta_signup: number; cta_find_pt: number }
    sources: { source: string; visitors: number }[]
    funnel: { signups: number; booked_pt: number; plus: number }
  }
  activity: {
    active_now: { trainer: number; client: number }
    dau: number
    wau: number
    mau: number
    daily: { date: string; trainer: number; client: number }[]
  }
  growth: {
    weekly: { period: string; trainer: number; client: number }[]
    monthly: { period: string; trainer: number; client: number }[]
  }
  plus: {
    active: number
    new_this_month: number
    churned_this_month: number
    cancelled_this_month: number
    avg_lifetime_days: number | null
    monthly: { period: string; new: number; churned: number }[]
  }
  kpis: {
    pts: { total: number; marketplace: number; activated: number; onboarding: number }
    clients: { total: number; paying_pt: number; plus: number; free: number }
  }
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0)) || 0
const round2 = (n: number) => Math.round(n * 100) / 100

/** PostgREST skickar numeric som tal eller text – allt blir tal här. */
export function normalizeAnalytics(raw: unknown): Analytics {
  const a = raw as Analytics
  const pm = (p: Partial<ProviderMonth> | undefined): ProviderMonth => ({
    gross: num(p?.gross),
    store_fee: num(p?.store_fee),
    net: num(p?.net),
    vat: num(p?.vat),
    gmv: num(p?.gmv),
    one_off_net: num(p?.one_off_net),
    recurring_net: num(p?.recurring_net),
    count: num(p?.count),
  })
  const vp = (p: Partial<VatPeriod> | undefined): VatPeriod => ({
    from: String(p?.from ?? ""),
    stripe_gross: num(p?.stripe_gross),
    stripe_vat: num(p?.stripe_vat),
    revenuecat_gross: num(p?.revenuecat_gross),
    revenuecat_net: num(p?.revenuecat_net),
  })
  return {
    ...a,
    economy: {
      month: { stripe: pm(a.economy?.month?.stripe), revenuecat: pm(a.economy?.month?.revenuecat) },
      vat_periods: { month: vp(a.economy?.vat_periods?.month), quarter: vp(a.economy?.vat_periods?.quarter), year: vp(a.economy?.vat_periods?.year) },
      mrr: { stripe: num(a.economy?.mrr?.stripe), revenuecat: num(a.economy?.mrr?.revenuecat), subscriptions: num(a.economy?.mrr?.subscriptions) },
      remaining_renewals: { stripe: num(a.economy?.remaining_renewals?.stripe), revenuecat: num(a.economy?.remaining_renewals?.revenuecat) },
      daily: (a.economy?.daily ?? []).map((d) => ({
        date: String(d.date).slice(0, 10),
        stripe_net: num(d.stripe_net),
        stripe_gross: num(d.stripe_gross),
        stripe_vat: num(d.stripe_vat),
        revenuecat_net: num(d.revenuecat_net),
        revenuecat_gross: num(d.revenuecat_gross),
        gmv: num(d.gmv),
      })),
    },
    traffic: {
      ...a.traffic,
      daily: (a.traffic?.daily ?? []).map((d) => ({ date: String(d.date).slice(0, 10), visitors: num(d.visitors), views: num(d.views) })),
    },
    activity: { ...a.activity, daily: (a.activity?.daily ?? []).map((d) => ({ ...d, date: String(d.date).slice(0, 10) })) },
    growth: {
      weekly: (a.growth?.weekly ?? []).map((d) => ({ ...d, period: String(d.period).slice(0, 10) })),
      monthly: (a.growth?.monthly ?? []).map((d) => ({ ...d, period: String(d.period).slice(0, 10) })),
    },
    plus: {
      ...a.plus,
      avg_lifetime_days: a.plus?.avg_lifetime_days == null ? null : num(a.plus.avg_lifetime_days),
      monthly: (a.plus?.monthly ?? []).map((d) => ({ ...d, period: String(d.period).slice(0, 10) })),
    },
  }
}

/** Utgående moms i ett bruttobelopp med 25 % moms: Brutto − Brutto / 1,25. */
export const vatOfGross = (gross: number) => round2(gross - gross / 1.25)
/** Nettot exklusive moms: Brutto / 1,25. */
export const exVat = (gross: number) => round2(gross / 1.25)

export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null)

const pick = <T extends Record<"stripe" | "revenuecat", number>>(o: T, source: Source) =>
  source === "all" ? o.stripe + o.revenuecat : o[source]

/** Månadens siffror för vald källa (Alla / Stripe / RevenueCat). */
export function monthTotals(a: Analytics, source: Source) {
  const m = a.economy.month
  const sum = (k: keyof ProviderMonth) => round2(pick({ stripe: m.stripe[k], revenuecat: m.revenuecat[k] }, source))
  return {
    net: sum("net"),
    gross: sum("gross"),
    gmv: sum("gmv"),
    storeFee: sum("store_fee"),
    vat: sum("vat"),
    oneOff: sum("one_off_net"),
    recurring: sum("recurring_net"),
    mrr: round2(pick(a.economy.mrr, source)),
    remainingRenewals: round2(pick(a.economy.remaining_renewals, source)),
  }
}

/**
 * Månadsprognos: (engångsintäkter hittills ÷ dagar som gått) × dagar i
 * månaden + återkommande intäkter som redan kommit + kvarvarande förnyelser
 * (prenumerationer som förnyas innan månaden är slut och inte är uppsagda).
 */
export function forecastMonth(input: { oneOffSoFar: number; recurringSoFar: number; remainingRenewals: number; daysPassed: number; daysInMonth: number }) {
  const days = Math.max(1, input.daysPassed)
  return round2((input.oneOffSoFar / days) * input.daysInMonth + input.recurringSoFar + input.remainingRenewals)
}

export type CumulativePoint = { day: number; date: string; actual: number | null; forecast: number | null; vat: number | null }

/**
 * Kumulativ intäkt per dag (graf 1). Faktiska värden till och med i dag,
 * sedan en streckad linje från dagens värde till prognosen vid månadens slut.
 * VAT = kumulativ utgående moms (bara Stripe – i butikerna sköter Apple/Google momsen).
 */
export function cumulativeSeries(a: Analytics, source: Source): CumulativePoint[] {
  const { days_in_month, days_passed, month_start } = a.calendar
  const t = monthTotals(a, source)
  const forecast = forecastMonth({
    oneOffSoFar: t.oneOff,
    recurringSoFar: t.recurring,
    remainingRenewals: t.remainingRenewals,
    daysPassed: days_passed,
    daysInMonth: days_in_month,
  })
  const byDate = new Map(a.economy.daily.map((d) => [d.date, d]))
  const start = new Date(`${String(month_start).slice(0, 10)}T12:00:00Z`)
  const out: CumulativePoint[] = []
  let cum = 0
  let vat = 0
  for (let i = 1; i <= days_in_month; i++) {
    const date = new Date(start.getTime() + (i - 1) * 86_400_000).toISOString().slice(0, 10)
    if (i <= days_passed) {
      const d = byDate.get(date)
      if (d) {
        cum += source === "revenuecat" ? d.revenuecat_net : source === "stripe" ? d.stripe_net : d.stripe_net + d.revenuecat_net
        vat += source === "revenuecat" ? 0 : d.stripe_vat
      }
      out.push({ day: i, date, actual: round2(cum), forecast: i === days_passed ? round2(cum) : null, vat: round2(vat) })
    } else {
      const share = (i - days_passed) / Math.max(1, days_in_month - days_passed)
      out.push({ day: i, date, actual: null, forecast: round2(cum + (forecast - cum) * share), vat: null })
    }
  }
  return out
}

/** Churn denna månad: utgångna prenumerationer ÷ aktiva vid månadens början. */
export function churnRate(churned: number, activeNow: number, newThisMonth: number) {
  const atStart = activeNow + churned - newThisMonth
  return atStart > 0 ? Math.round((churned / atStart) * 1000) / 10 : null
}

/** Genomsnittlig livslängd i månader: uppmätt om det finns, annars 1 / churn. */
export function lifetimeMonths(avgLifetimeDays: number | null, churnPct: number | null) {
  if (avgLifetimeDays && avgLifetimeDays > 0) return Math.round((avgLifetimeDays / 30) * 10) / 10
  if (churnPct && churnPct > 0) return Math.round((100 / churnPct) * 10) / 10
  return null
}

/** KPI:erna i panelen. */
export function deriveKpis(a: Analytics, source: Source) {
  const t = monthTotals(a, source)
  const churn = churnRate(a.plus.churned_this_month, a.plus.active, a.plus.new_this_month)
  return {
    landingToSignup: pct(a.traffic.funnel.signups, a.traffic.totals.visitors),
    plusConversion: pct(a.kpis.clients.plus, a.kpis.clients.total),
    ptActivation: pct(a.kpis.pts.activated, a.kpis.pts.total),
    churn,
    lifetimeMonths: lifetimeMonths(a.plus.avg_lifetime_days, churn),
    // ARPU: månadens nettointäkt ÷ aktiva användare senaste 30 dagarna (MAU).
    arpu: a.activity.mau > 0 ? round2(t.net / a.activity.mau) : null,
  }
}

/** Momsrutan: period → Stripe (25 % utgående moms) och RevenueCat (MoR). */
export function vatSummary(p: VatPeriod) {
  return {
    stripeGross: round2(p.stripe_gross),
    stripeVat: vatOfGross(p.stripe_gross),
    stripeNetExVat: exVat(p.stripe_gross),
    revenuecatNet: round2(p.revenuecat_net),
  }
}

export const sek = (n: number, decimals = 0) =>
  `${n.toLocaleString("sv-SE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} kr`
