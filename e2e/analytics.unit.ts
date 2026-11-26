// Enhetstester för adminstatistiken (v82): prognos, moms, churn, RevenueCat/Stripe → rader, spårning.
//   npx tsx --tsconfig tsconfig.json e2e/analytics.unit.ts
import assert from "node:assert/strict"

import { demoAnalytics } from "../src/lib/analytics/demo"
import {
  churnRate,
  cumulativeSeries,
  deriveKpis,
  exVat,
  forecastMonth,
  lifetimeMonths,
  monthTotals,
  normalizeAnalytics,
  pct,
  vatOfGross,
  vatSummary,
} from "../src/lib/analytics/finance"
import { revenueCatRecords, stripeInvoiceRecords, stripeSubscriptionRecords, storeFeePercent, toSek } from "../src/lib/analytics/revenue"
import { ctaFor, isBot, referrerHost, trackBody, visitorHash } from "../src/lib/analytics/tracking"

async function main() {
  let n = 0
  const ok = async (name: string, fn: () => void | Promise<void>) => {
    await fn()
    n++
    console.log("ok  ", name)
  }

  await ok("moms: Brutto − Brutto/1,25 och netto exkl. moms", () => {
    assert.equal(vatOfGross(125), 25)
    assert.equal(exVat(125), 100)
    assert.equal(vatOfGross(49), 9.8)
    assert.equal(vatOfGross(0), 0)
  })

  await ok("prognos: (engång ÷ dagar) × dagar i månaden + återkommande + förnyelser kvar", () => {
    assert.equal(forecastMonth({ oneOffSoFar: 1000, recurringSoFar: 200, remainingRenewals: 300, daysPassed: 10, daysInMonth: 30 }), 3500)
    // Dag 0 räknas som dag 1 (ingen division med noll).
    assert.equal(forecastMonth({ oneOffSoFar: 100, recurringSoFar: 0, remainingRenewals: 0, daysPassed: 0, daysInMonth: 31 }), 3100)
  })

  await ok("procent, churn och livslängd", () => {
    assert.equal(pct(1, 3), 33.3)
    assert.equal(pct(1, 0), null)
    assert.equal(churnRate(10, 100, 10), 10)
    assert.equal(churnRate(0, 0, 0), null)
    assert.equal(lifetimeMonths(90, 10), 3)
    assert.equal(lifetimeMonths(null, 10), 10)
    assert.equal(lifetimeMonths(null, null), null)
  })

  const a = normalizeAnalytics(demoAnalytics(30, new Date("2026-11-15T10:00:00Z")))
  await ok("demodatan: rätt kalender och längder", () => {
    assert.equal(a.calendar.days_in_month, 30)
    assert.equal(a.calendar.days_passed, 15)
    assert.equal(a.economy.daily.length, 15)
    assert.equal(a.traffic.daily.length, 30)
    assert.equal(a.activity.daily.length, 30)
    assert.equal(normalizeAnalytics(demoAnalytics(90)).traffic.daily.length, 90)
  })

  await ok("källfiltret: Alla = Stripe + RevenueCat", () => {
    const all = monthTotals(a, "all")
    const s = monthTotals(a, "stripe")
    const r = monthTotals(a, "revenuecat")
    assert.ok(Math.abs(all.net - (s.net + r.net)) < 0.02)
    assert.equal(r.vat, 0)
  })

  await ok("kumulativ serie: faktiskt till i dag, prognos till månadens slut", () => {
    const s = cumulativeSeries(a, "all")
    assert.equal(s.length, 30)
    assert.equal(s[14].actual, s[14].forecast, "prognosen börjar i dagens värde")
    assert.equal(s[15].actual, null)
    const t = monthTotals(a, "all")
    const f = forecastMonth({ oneOffSoFar: t.oneOff, recurringSoFar: t.recurring, remainingRenewals: t.remainingRenewals, daysPassed: 15, daysInMonth: 30 })
    assert.ok(Math.abs((s[29].forecast ?? 0) - f) < 0.02, "slutar i prognosen")
    assert.ok(Math.abs((s[14].actual ?? 0) - t.net) < 0.05, "faktiskt = månadens netto")
    for (let i = 1; i < 15; i++) assert.ok((s[i].actual ?? 0) >= (s[i - 1].actual ?? 0), "kumulativ ökar")
    assert.equal(cumulativeSeries(a, "revenuecat")[14].vat, 0, "ingen moms för RevenueCat")
  })

  await ok("momsrutan och KPI:er", () => {
    const v = vatSummary({ from: "", stripe_gross: 1250, stripe_vat: 250, revenuecat_gross: 100, revenuecat_net: 85 })
    assert.deepEqual(v, { stripeGross: 1250, stripeVat: 250, stripeNetExVat: 1000, revenuecatNet: 85 })
    const k = deriveKpis(a, "all")
    assert.equal(k.ptActivation, pct(45, 64))
    assert.ok(k.arpu !== null && k.arpu > 0)
  })

  await ok("PostgREST-tal som text blir tal", () => {
    const raw = demoAnalytics(7) as unknown as { economy: { month: { stripe: Record<string, unknown> } } }
    raw.economy.month.stripe.net = "123.45"
    assert.equal(normalizeAnalytics(raw).economy.month.stripe.net, 123.45)
  })

  await ok("valuta och butiksavgift", () => {
    assert.equal(toSek(49, "SEK"), 49)
    assert.equal(toSek(10, "USD", null, { SEK_RATE_USD: "10" }), 100)
    assert.equal(toSek(10, "XYZ", 2, { SEK_RATE_USD: "10" }), 20, "okänd valuta: USD-priset")
    assert.equal(storeFeePercent({}), 15)
    assert.equal(storeFeePercent({ REVENUECAT_STORE_FEE_PERCENT: "30" }), 30)
    assert.equal(storeFeePercent({ REVENUECAT_STORE_FEE_PERCENT: "x" }), 15)
  })

  const t0 = Date.parse("2026-11-10T10:00:00Z")
  const rcBase = {
    id: "evt1",
    product_id: "coavira_plus_monthly",
    transaction_id: "tx1",
    store: "APP_STORE",
    price: 4.67,
    price_in_purchased_currency: 49,
    currency: "SEK",
    purchased_at_ms: t0,
    expiration_at_ms: t0 + 30 * 86_400_000,
    event_timestamp_ms: t0,
  }
  await ok("RevenueCat: köp → intäkt (15 % avgift) + start", () => {
    const r = revenueCatRecords({ ...rcBase, type: "INITIAL_PURCHASE" }, "u1", {})
    assert.equal(r.revenue?.gross_sek, 49)
    assert.equal(r.revenue?.store_fee_sek, 7.35)
    assert.equal(r.revenue?.store, "APP_STORE")
    assert.equal(r.revenue?.is_subscription, true)
    assert.equal(r.revenue?.period_days, 30)
    assert.equal(r.revenue?.kind, "plus")
    assert.equal(r.subscription?.event_type, "started")
  })
  await ok("RevenueCat: förnyelse, provperiod, uppsägning, utgång, återbetalning", () => {
    assert.equal(revenueCatRecords({ ...rcBase, type: "RENEWAL", store: "PLAY_STORE" }, "u1", {}).revenue?.store, "PLAY_STORE")
    const trial = revenueCatRecords({ ...rcBase, type: "INITIAL_PURCHASE", price: 0, price_in_purchased_currency: 0 }, "u1", {})
    assert.equal(trial.revenue, undefined, "provperiod: ingen intäkt")
    assert.equal(trial.subscription?.event_type, "started")
    const c = revenueCatRecords({ ...rcBase, type: "CANCELLATION", cancel_reason: "UNSUBSCRIBE" }, "u1", {})
    assert.equal(c.subscription?.event_type, "cancelled")
    assert.equal(c.subscription?.cancel_reason, "UNSUBSCRIBE")
    assert.ok(c.subscription?.unsubscribe_detected_at)
    assert.equal(c.refund, undefined, "vanlig uppsägning är ingen återbetalning")
    assert.equal(revenueCatRecords({ ...rcBase, type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT" }, "u1", {}).refund?.external_id, "tx1")
    assert.equal(revenueCatRecords({ ...rcBase, type: "EXPIRATION", expiration_reason: "BILLING_ERROR" }, "u1", {}).subscription?.cancel_reason, "BILLING_ERROR")
    const boost = revenueCatRecords({ ...rcBase, type: "CANCELLATION", product_id: "coavira_pt_boost_7d" }, "u1", {})
    assert.equal(boost.refund?.external_id, "tx1", "engångsköp: CANCELLATION = återbetalning")
    assert.equal(boost.subscription, undefined)
    assert.equal(revenueCatRecords({ ...rcBase, type: "NON_RENEWING_PURCHASE", product_id: "coavira_pt_boost_7d", price_in_purchased_currency: 199 }, null, {}).revenue?.kind, "boost")
    assert.equal(revenueCatRecords({ ...rcBase, type: "SUBSCRIBER_ALIAS" }, "u1", {}).revenue, undefined)
    assert.equal(revenueCatRecords({ ...rcBase, type: "RENEWAL", environment: "SANDBOX" }, "u1", {}).revenue?.environment, "SANDBOX")
  })

  await ok("Stripe: invoice.paid för prenumeration", () => {
    const r = stripeInvoiceRecords(
      {
        id: "in_1",
        amount_paid: 4900,
        currency: "sek",
        billing_reason: "subscription_cycle",
        livemode: true,
        status_transitions: { paid_at: 1_800_000_000 },
        lines: { data: [{ period: { start: 1_800_000_000, end: 1_800_000_000 + 30 * 86_400 } }] },
        parent: { subscription_details: { subscription: "sub_1", metadata: { user_id: "u2" } } },
      },
      {}
    )
    assert.equal(r.revenue?.gross_sek, 49)
    assert.equal(r.revenue?.user_id, "u2")
    assert.equal(r.revenue?.period_days, 30)
    assert.equal(r.subscription?.event_type, "renewed")
    assert.deepEqual(stripeInvoiceRecords({ id: "in_2", amount_paid: 4900, currency: "sek" }), {}, "fakturor utan prenumeration ignoreras")
  })
  await ok("Stripe: uppsägning, ångrad uppsägning och churn", () => {
    const sub = { id: "sub_1", metadata: { user_id: "u2" }, cancel_at_period_end: true, canceled_at: 1_800_000_000, cancellation_details: { reason: "cancellation_requested", feedback: "too_expensive" } }
    const c = stripeSubscriptionRecords("evt_1", "customer.subscription.updated", sub, { cancel_at_period_end: false })
    assert.equal(c.subscription?.event_type, "cancelled")
    assert.equal(c.subscription?.cancel_reason, "too_expensive")
    assert.equal(stripeSubscriptionRecords("evt_2", "customer.subscription.updated", { ...sub, cancel_at_period_end: false }, { cancel_at_period_end: true }).subscription?.event_type, "uncancelled")
    assert.deepEqual(stripeSubscriptionRecords("evt_3", "customer.subscription.updated", sub, { }), {}, "andra ändringar ignoreras")
    assert.equal(stripeSubscriptionRecords("evt_4", "customer.subscription.deleted", sub).subscription?.event_type, "expired")
  })

  await ok("spårning: hash, referrer, bottar och CTA", async () => {
    const h = await visitorHash("2026-11-26", "1.2.3.4", "Mozilla")
    assert.match(h, /^[0-9a-f]{64}$/)
    assert.equal(h, await visitorHash("2026-11-26", "1.2.3.4", "Mozilla"), "samma dag = samma hash")
    assert.notEqual(h, await visitorHash("2026-11-27", "1.2.3.4", "Mozilla"), "byts varje dygn")
    assert.equal(referrerHost("https://www.google.com/search?q=pt", "coavira.fit"), "google.com")
    assert.equal(referrerHost("https://coavira.fit/bli-pt", "www.coavira.fit"), null, "egen sajt räknas inte")
    assert.equal(referrerHost("inte en adress"), null)
    assert.ok(isBot("Googlebot/2.1") && isBot("") && !isBot("Mozilla/5.0 (iPhone)"))
    assert.equal(ctaFor({ href: "/bli-pt" }), "cta_signup")
    assert.equal(ctaFor({ href: "/kom-igang?x=1" }), "cta_signup")
    assert.equal(ctaFor({ href: "#ladda-ned" }), "cta_find_pt")
    assert.equal(ctaFor({ href: "https://apps.apple.com/app/x", store: "ios" }), "cta_find_pt")
    assert.equal(ctaFor({ track: "cta_signup", href: "/support" }), "cta_signup")
    assert.equal(ctaFor({ href: "/support" }), null)
    assert.equal(trackBody.parse({}).event, "pageview")
    assert.equal(trackBody.safeParse({ path: "https://evil" }).success, false)
    assert.equal(trackBody.safeParse({ event: "hack" }).success, false)
    assert.equal(trackBody.parse({ utm_source: "  " }).utm_source, undefined)
  })

  console.log(`\n${n} ok`)
}
void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
