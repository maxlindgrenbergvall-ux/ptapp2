// E2E (demoläget) för v22:
//  - vilotimern: −15 s och +15 s, aldrig negativ tid
//  - /app-retur: Stripes retur lämnar över till appen (com.coavira.app://…)
//  - appen: djuplänk från Stripe stänger webbläsarvyn och öppnar sidan
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v22-app-checkout.test.mjs [skärmdumpsmapp]
import { chromium } from "playwright"
import fs from "node:fs"

import { APP_UA, installNativeFake } from "./native-fake.mjs"

const out = process.argv[2] ?? "e2e/screenshots"
fs.mkdirSync(out, { recursive: true })
const base = process.env.BASE_URL ?? "http://localhost:3000"
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m) => {
  console.log("FAIL", m)
  process.exitCode = 1
}
const check = (c, m) => (c ? ok(m) : fail(m))
const watch = (p) => {
  p.on("pageerror", (e) => errors.push(`${p.url()} pageerror: ${e.message}`))
  p.on("console", (m) => m.type() === "error" && !/Failed to load resource|ERR_UNKNOWN_URL_SCHEME|com\.coavira\.app/.test(m.text()) && errors.push(`${p.url()} console: ${m.text()}`))
}
const seconds = async (p) => {
  const t = (await p.locator("[role=timer] .tabular").innerText()).trim()
  const [mm, ss] = t.split(":").map(Number)
  return mm * 60 + ss
}

// ---------------------------------------------------------- vilotimern ---
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const p = await ctx.newPage()
  watch(p)
  await p.goto(base + "/klient")
  await p.waitForSelector("text=Dagens träning")
  await p.click("text=Starta passet")
  await p.waitForSelector("text=Avsluta")
  await p.click('button[aria-label="Bocka av set 1"]')
  const timer = p.locator("[role=timer]")
  await timer.waitFor()
  const minus = timer.getByRole("button", { name: "15 sekunder kortare vila" })
  const plus = timer.getByRole("button", { name: "15 sekunder längre vila" })
  check((await minus.innerText()).trim() === "−15 s" && (await plus.innerText()).trim() === "+15 s", "vilotimern har −15 s bredvid +15 s")
  const box = await timer.boundingBox()
  check(box && box.x >= 0 && box.x + box.width <= 390, "timern ryms på en iPhone-skärm (390 px)")
  await p.screenshot({ path: `${out}/v22-vilotimer.png` })

  const start = await seconds(p)
  await plus.click()
  const afterPlus = await seconds(p)
  check(afterPlus >= start + 14 && afterPlus <= start + 15, `+15 s lägger till 15 sekunder (${start} → ${afterPlus})`)
  await minus.click()
  const afterMinus = await seconds(p)
  check(afterMinus >= afterPlus - 16 && afterMinus <= afterPlus - 14, `−15 s drar av 15 sekunder (${afterPlus} → ${afterMinus})`)
  // Dra av tills mindre än 15 s är kvar – sista trycket avslutar vilan (0:00), aldrig negativ tid.
  for (let i = 0; i < 20 && (await minus.isVisible().catch(() => false)); i++) await minus.click()
  await p.waitForSelector("text=Vilan är slut")
  check((await p.locator("[role=timer] .tabular").innerText()).trim() === "0:00", "under 15 s kvar: −15 s avslutar vilan på 0:00")
  check((await minus.count()) === 0, "när vilan är slut visas inga ±15 s-knappar")
  await p.screenshot({ path: `${out}/v22-vilotimer-slut.png` })
  await timer.getByRole("button", { name: "Kör!" }).click()
  check((await timer.count()) === 0, "Kör! stänger timern")
  await ctx.close()
}

// ---------------------------------------------------- /app-retur (webbläsarvyn) ---
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })
  const p = await ctx.newPage()
  watch(p)
  const tried = []
  p.on("framenavigated", (f) => f === p.mainFrame() && tried.push(f.url()))
  p.on("request", (r) => r.url().startsWith("com.coavira.app:") && tried.push(r.url()))
  await p.goto(base + "/app-retur/klient/kop?session_id=cs_test_1")
  await p.waitForSelector("text=Tack! Betalningen är klar")
  const href = await p.getByRole("link", { name: "Tillbaka till Coavira" }).getAttribute("href")
  check(href === "com.coavira.app://klient/kop?session_id=cs_test_1", "betald: knappen öppnar appen på kvittosidan (com.coavira.app://klient/kop?session_id=…)")
  check(p.url().includes("/app-retur/"), "webbläsaren (utan app) stannar på sidan med knappen")
  await p.screenshot({ path: `${out}/v22-app-retur.png` })
  const robots = await p.getAttribute('meta[name="robots"]', "content")
  check(/noindex/.test(robots ?? ""), "sidan indexeras inte")

  await p.goto(base + "/app-retur/klient/hitta/t1?kop=avbrutet")
  await p.waitForSelector("text=Betalningen avbröts")
  check((await p.getByRole("link", { name: "Tillbaka till Coavira" }).getAttribute("href")) === "com.coavira.app://klient/hitta/t1?kop=avbrutet", "avbruten: tillbaka till PT:ns sida i appen")

  // "//" slås ihop av Next (308) → en intern sökväg i appen, aldrig en annan domän.
  await p.goto(base + "/app-retur//evil.example/x")
  await p.waitForSelector("text=Betalningen avbröts")
  check((await p.getByRole("link", { name: "Tillbaka till Coavira" }).getAttribute("href")) === "com.coavira.app://evil.example/x", "dubbelsnedstreck blir en intern sökväg i appen")
  for (const bad of ["/app-retur/%2F%2Fevil.example", "/app-retur/app-retur/klient"]) {
    await p.goto(base + bad)
    await p.waitForSelector("text=Länken fungerar inte")
    check((await p.getByRole("link", { name: "Tillbaka till Coavira" }).count()) === 0, `ogiltig retur (${bad}) skickas ingenstans`)
  }
  await ctx.close()
}

// ------------------------------------------------------------ i appen ---
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: APP_UA, isMobile: true, hasTouch: true })
  await ctx.addInitScript(installNativeFake)
  const p = await ctx.newPage()
  watch(p)
  // Gamla app-versioner som betalade i WebView: /app-retur går direkt till sidan.
  await p.goto(base + "/app-retur/klient/kalender?kop=avbrutet")
  await p.waitForURL(/\/klient\/kalender\?kop=avbrutet$/)
  ok("i appens WebView går /app-retur direkt till sidan")

  // Stripe skickar tillbaka via appens URL-schema: vyn stängs och sidan öppnas.
  await p.goto(base + "/klient")
  await p.waitForSelector("text=Dagens träning")
  await p.waitForFunction(() => window.__native.count("App", "addListener") > 0)
  await p.evaluate(() => window.__native.emit("App", "appUrlOpen", { url: "com.coavira.app://klient/framsteg?plus=klar&session_id=cs_x" }))
  await p.waitForURL(/\/klient\/framsteg\?plus=klar&session_id=cs_x$/)
  check((await p.evaluate(() => sessionStorage.getItem("fake:browser-closed"))) === "1", "djuplänken från Stripe stänger webbläsarvyn och öppnar sidan i appen")

  // Stripe-länkar öppnas i webbläsarvyn, inte i appens WebView.
  await p.evaluate(() => {
    const a = document.createElement("a")
    a.href = "https://checkout.stripe.com/c/pay/cs_live_x"
    a.textContent = "stripe"
    a.id = "stripe-link"
    document.body.append(a)
  })
  await p.evaluate(() => document.getElementById("stripe-link").click())
  await p.waitForFunction(() => window.__native.calls.some((c) => c.plugin === "Browser" && c.method === "open"))
  const opened = await p.evaluate(() => window.__native.calls.find((c) => c.plugin === "Browser" && c.method === "open")?.options)
  check(opened?.url === "https://checkout.stripe.com/c/pay/cs_live_x" && /\/klient\/framsteg/.test(p.url()), "Stripe-länk öppnas i webbläsarvyn (Klar-knapp), appen ligger kvar")
  await ctx.close()
}

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
