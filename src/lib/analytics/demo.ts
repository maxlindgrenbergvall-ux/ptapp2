/**
 * Påhittad statistik för demoläget (v82) – samma form som
 * get_admin_crm_analytics(). Deterministisk (samma siffror varje gång för
 * samma dag), så att sidan inte hoppar mellan laddningar.
 */
import type { Analytics } from "@/lib/analytics/finance"

function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)

export function demoAnalytics(periodDays: number, now = new Date()): Analytics {
  const today = new Date(`${now.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" })}T12:00:00Z`)
  const r = rng(Number(iso(today).replaceAll("-", "")))
  const y = today.getUTCFullYear()
  const m = today.getUTCMonth()
  const monthStart = new Date(Date.UTC(y, m, 1, 12))
  const monthEnd = new Date(Date.UTC(y, m + 1, 0, 12))
  const daysInMonth = monthEnd.getUTCDate()
  const daysPassed = today.getUTCDate()

  const daily = Array.from({ length: daysPassed }, (_, i) => {
    const bookings = Math.round(r() * 4) * (60 + Math.round(r() * 80))
    const plusWeb = r() > 0.6 ? 49 : 0
    const stripeGross = bookings + plusWeb + (r() > 0.85 ? 199 : 0)
    // ~412 Plus-medlemmar à 49 kr/mån → runt 14 förnyelser per dag.
    const rcGross = Math.round(11 + r() * 6) * 49 + (r() > 0.8 ? 499 : 0)
    return {
      date: iso(addDays(monthStart, i)),
      stripe_net: stripeGross,
      stripe_gross: stripeGross,
      stripe_vat: Math.round((stripeGross - stripeGross / 1.25) * 100) / 100,
      revenuecat_net: Math.round(rcGross * 0.85 * 100) / 100,
      revenuecat_gross: rcGross,
      gmv: bookings * 10 + plusWeb,
    }
  })
  const sum = (k: keyof (typeof daily)[number]) => daily.reduce((s, d) => s + Number(d[k]), 0)
  const stripeGross = sum("stripe_gross")
  const rcGross = sum("revenuecat_gross")
  const rcNet = sum("revenuecat_net")
  const vat = (g: number) => Math.round((g - g / 1.25) * 100) / 100

  const days = Math.min(Math.max(periodDays, 1), 365)
  const traffic = Array.from({ length: days }, (_, i) => {
    const date = addDays(today, i - days + 1)
    const weekend = [0, 6].includes(date.getUTCDay())
    const visitors = Math.round(70 + i * (60 / days) + r() * 40 - (weekend ? 20 : 0))
    return { date: iso(date), visitors, views: Math.round(visitors * (1.4 + r() * 0.6)) }
  })
  const visitors = traffic.reduce((s, d) => s + d.visitors, 0)
  const activity = Array.from({ length: 30 }, (_, i) => ({
    date: iso(addDays(today, i - 29)),
    trainer: Math.round(14 + i * 0.3 + r() * 6),
    client: Math.round(90 + i * 2.2 + r() * 25),
  }))
  const weekStart = addDays(today, -((today.getUTCDay() + 6) % 7))
  const weekly = Array.from({ length: 12 }, (_, i) => ({
    period: iso(addDays(weekStart, (i - 11) * 7)),
    trainer: Math.round(2 + r() * 5 + i * 0.3),
    client: Math.round(15 + r() * 20 + i * 2),
  }))
  const monthly = Array.from({ length: 12 }, (_, i) => ({
    period: iso(new Date(Date.UTC(y, m - 11 + i, 1, 12))),
    trainer: Math.round(8 + r() * 12 + i * 1.5),
    client: Math.round(60 + r() * 60 + i * 12),
  }))
  const plusMonthly = Array.from({ length: 12 }, (_, i) => ({
    period: iso(new Date(Date.UTC(y, m - 11 + i, 1, 12))),
    new: Math.round(10 + r() * 15 + i * 3),
    churned: Math.round(2 + r() * 6 + i * 0.6),
  }))
  const plusActive = 412
  const signups = Math.round(visitors * 0.064)

  return {
    generated_at: now.toISOString(),
    period_days: days,
    calendar: {
      today: iso(today),
      month_start: iso(monthStart),
      month_end: iso(monthEnd),
      days_in_month: daysInMonth,
      days_passed: daysPassed,
      quarter_start: iso(new Date(Date.UTC(y, Math.floor(m / 3) * 3, 1, 12))),
      year_start: iso(new Date(Date.UTC(y, 0, 1, 12))),
    },
    economy: {
      month: {
        stripe: { gross: stripeGross, store_fee: 0, net: stripeGross, vat: vat(stripeGross), gmv: sum("gmv"), one_off_net: stripeGross, recurring_net: 0, count: daysPassed * 3 },
        revenuecat: {
          gross: rcGross,
          store_fee: Math.round((rcGross - rcNet) * 100) / 100,
          net: rcNet,
          vat: 0,
          gmv: rcGross,
          one_off_net: Math.round(rcNet * 0.1),
          recurring_net: Math.round(rcNet * 0.9),
          count: daysPassed * 2,
        },
      },
      vat_periods: {
        month: { from: iso(monthStart), stripe_gross: stripeGross, stripe_vat: vat(stripeGross), revenuecat_gross: rcGross, revenuecat_net: rcNet },
        quarter: { from: "", stripe_gross: stripeGross * 2.6, stripe_vat: vat(stripeGross * 2.6), revenuecat_gross: rcGross * 2.4, revenuecat_net: rcNet * 2.4 },
        year: { from: "", stripe_gross: stripeGross * 9.1, stripe_vat: vat(stripeGross * 9.1), revenuecat_gross: rcGross * 8.2, revenuecat_net: rcNet * 8.2 },
      },
      mrr: { stripe: 0, revenuecat: Math.round(plusActive * 41.65), subscriptions: plusActive },
      remaining_renewals: { stripe: 0, revenuecat: Math.round(((daysInMonth - daysPassed) / daysInMonth) * plusActive * 41.65 * 0.92) },
      daily,
    },
    traffic: {
      daily: traffic,
      totals: { visitors, views: traffic.reduce((s, d) => s + d.views, 0), cta_signup: Math.round(visitors * 0.11), cta_find_pt: Math.round(visitors * 0.18) },
      sources: [
        { source: "google.com", visitors: Math.round(visitors * 0.41) },
        { source: "instagram", visitors: Math.round(visitors * 0.27) },
        { source: "Direkt", visitors: Math.round(visitors * 0.19) },
        { source: "tiktok", visitors: Math.round(visitors * 0.08) },
        { source: "facebook.com", visitors: Math.round(visitors * 0.05) },
      ],
      funnel: { signups, booked_pt: Math.round(signups * 0.21), plus: Math.round(signups * 0.12) },
    },
    activity: { active_now: { trainer: 6, client: 41 }, dau: activity.at(-1)!.trainer + activity.at(-1)!.client, wau: 1120, mau: 2380, daily: activity },
    growth: { weekly, monthly },
    plus: { active: plusActive, new_this_month: 38, churned_this_month: 11, cancelled_this_month: 17, avg_lifetime_days: 214, monthly: plusMonthly },
    kpis: { pts: { total: 64, marketplace: 41, activated: 45, onboarding: 19 }, clients: { total: 2610, paying_pt: 486, plus: plusActive, free: 1790 } },
  }
}
