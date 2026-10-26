// E2E (Supabase-läge) för v22: Stripe Checkout i appen öppnas i webbläsarvyn.
//  - servern: från appen går success_url/cancel_url via /app-retur, på webben som förut
//  - appen: Betala öppnar Stripe med Browser.open (Klar-knapp), appen ligger kvar,
//    och knappen slutar snurra när vyn stängs (browserFinished)
// Kräver mock-supabase och mock-stripe (se v16-supabase.test.mjs).
import { chromium } from "playwright"

import { APP_UA, installNativeFake } from "./native-fake.mjs"

const base = process.env.BASE_URL ?? "http://localhost:3000"
const mock = "http://localhost:54321"
const stripe = "http://localhost:54500"
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m) => {
  console.log("FAIL", m)
  process.exitCode = 1
}
const check = (c, m) => (c ? ok(m) : fail(m))
await fetch(`${mock}/__reset`)

const T1 = "11111111-0000-4000-8000-000000000001"
const S_SINGLE = "99999999-0000-4000-8000-000000000001"
const lastSession = async () => (await (await fetch(`${stripe}/__log`)).json()).filter((e) => e.method === "POST").at(-1)?.form ?? {}

async function login(app) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...(app ? { userAgent: APP_UA, isMobile: true, hasTouch: true } : {}) })
  if (app) await ctx.addInitScript(installNativeFake)
  const p = await ctx.newPage()
  p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
  await p.goto(`${base}/logga-in`)
  await p.fill("#email", "sara@test.se")
  await p.fill("#password", "hemligt123")
  await p.click("button[type=submit]")
  await p.waitForURL(/\/klient$/)
  await p.waitForLoadState("networkidle")
  await p.waitForSelector("[data-testid=cart-count]")
  return { ctx, p }
}

// ------------------------------------------------------- retur-adresser ---
{
  const { ctx, p } = await login(false)
  const r = await p.request.post(`${base}/api/checkout`, { data: { items: [{ serviceId: S_SINGLE, quantity: 1 }] } })
  check(r.ok(), "webben: kassan startar")
  const form = await lastSession()
  check(form.success_url === `${base}/klient/kop?session_id={CHECKOUT_SESSION_ID}` && form.cancel_url === `${base}/klient/hitta/${T1}?kop=avbrutet`, "webben: Stripe skickar tillbaka direkt till sidan (som förut)")
  await ctx.close()
}
{
  const { ctx, p } = await login(true)
  const r = await p.request.post(`${base}/api/checkout`, { data: { items: [{ serviceId: S_SINGLE, quantity: 1 }] }, headers: { "user-agent": APP_UA } })
  check(r.ok(), "appen: kassan startar")
  const form = await lastSession()
  check(form.success_url === `${base}/app-retur/klient/kop?session_id={CHECKOUT_SESSION_ID}`, "appen: success_url går via /app-retur (lämnar över till appen)")
  check(form.cancel_url === `${base}/app-retur/klient/hitta/${T1}?kop=avbrutet`, "appen: cancel_url går via /app-retur")
  check(form["metadata[client_id]"] !== undefined && /^\d+$/.test(form["line_items[0][price_data][unit_amount]"] ?? ""), "samma kassa i övrigt (priser från databasen)")

  // ------------------------------------------------- Betala i appen ---
  await p.goto(`${base}/klient`)
  await p.waitForSelector("[data-testid=cart-count]")
  await p.waitForFunction(() => window.__native.count("App", "addListener") > 0)
  await p.click('button[aria-label^="Varukorg"]')
  const pay = p.locator("[data-testid=cart] button:has-text('Till kassan')").first()
  await pay.waitFor()
  await pay.click()
  await p.waitForFunction(() => window.__native.calls.some((c) => c.plugin === "Browser" && c.method === "open"))
  const opened = await p.evaluate(() => window.__native.calls.find((c) => c.plugin === "Browser" && c.method === "open")?.options)
  check(opened?.url === "http://localhost:54500/pay/cs_test_1" && opened.presentationStyle === "fullscreen", "Betala öppnar Stripe Checkout i webbläsarvyn (med Klar-knapp)")
  check(/\/klient$/.test(p.url()), "appen ligger kvar under betalningen (WebView lämnar aldrig appen)")
  check(await pay.isDisabled(), "knappen väntar medan betalningsvyn är öppen")
  check(
    await p.evaluate(() => window.__native.calls.some((c) => c.plugin === "Browser" && c.method === "addListener" && c.options?.eventName === "browserFinished")),
    "appen lyssnar på när vyn stängs (browserFinished)"
  )
  // Användaren ångrar sig och trycker Klar.
  await p.evaluate(() => window.__native.emit("Browser", "browserFinished", {}))
  await p.waitForFunction(() => {
    const b = [...document.querySelectorAll("[data-testid=cart] button")].find((x) => x.textContent?.includes("Till kassan"))
    return b && !b.disabled
  })
  ok("Klar → knappen går att trycka på igen (ingen låst kassa)")
  check(/\/klient$/.test(p.url()), "appen är kvar där användaren var")
  await ctx.close()
}

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
