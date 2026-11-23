// E2E för v71: laddningsskärmen före inloggningen i mobilappen, och överlämningen
// av datan från inloggningen till appen (så att appen är klar när den öppnas).
//
// Del 1 (demoläge eller Supabase-läge): startskärmen i mobilappen.
// Del 2 (bara Supabase-läge mot e2e/mock-supabase.mjs): inloggning → överlämning.
//   node e2e/mock-supabase.mjs &
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=test npm run build && npm start
//   BASE_URL=http://localhost:3000 SUPABASE_MODE=1 node e2e/v71-start-inloggning.test.mjs
import { chromium, devices } from "playwright"

const base = process.env.BASE_URL ?? "http://localhost:3000"
const supabaseMode = process.env.SUPABASE_MODE === "1"
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
const ok = (m) => console.log("ok  ", m)
const fail = (m, x) => {
  console.log("FAIL", m, x === undefined ? "" : JSON.stringify(x))
  process.exitCode = 1
}
const check = (c, m, x) => (c ? ok(m) : fail(m, x))
const iphone = devices["iPhone 13"]
const nativeUA = `${iphone.userAgent} CoaviraApp`
const listen = (p) => {
  p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
  p.on("console", (m) => m.type() === "error" && !/Failed to load resource|ERR_FAILED|net::|401|400|realtime\/v1\/websocket/.test(m.text()) && errors.push(`console: ${m.text()}`))
}
const splash = (p, mode) => p.locator(`[data-testid=boot-splash][data-mode=${mode}]`)
const shown = (p, mode) => splash(p, mode).evaluate((el) => getComputedStyle(el).display !== "none").catch(() => false)

// --------------------------------------------- 1. startskärmen i mobilappen ---
const app = await browser.newContext({ ...iphone, userAgent: nativeUA, colorScheme: "dark" })
const p = await app.newPage()
listen(p)
await p.goto(base + "/kom-igang", { waitUntil: "commit" })
await splash(p, "start").waitFor({ state: "attached" })
check(await p.evaluate(() => document.documentElement.classList.contains("native-app")), "mobilappen känns igen innan sidan ritas (html.native-app)")
check(await shown(p, "start"), "laddningsskärmen visas över inloggningen vid appstart")
const a1 = await p.evaluate(() => Number(document.querySelector("[data-testid=boot-splash]")?.dataset.angle ?? -1))
await p.waitForTimeout(200)
const a2 = await p.evaluate(() => Number(document.querySelector("[data-testid=boot-splash]")?.dataset.angle ?? -1))
const clock = await p.evaluate(() => ((Date.now() % 1100) / 1100) * 360)
check(a1 !== a2 || (await p.locator("[data-testid=boot-splash][data-ready]").count()) > 0, `C:et snurrar medan appen förladdas (${a1}° → ${a2}°)`)
await splash(p, "start").waitFor({ state: "detached", timeout: 6000 })
ok("startskärmen tonas bort när appen är förladdad (högst 3 s + landning)")
check(await p.locator("a[href='/logga-in'], a[href^='/logga-in'], button").first().isVisible(), "inloggningen syns och går att använda")
check(await p.evaluate(() => document.documentElement.classList.contains("app-started") && sessionStorage.getItem("coavira:started") === "1"), "markerad som startad för den här appstarten")
void clock

// Samma appstart: andra inloggningssidor visar ingen ny startskärm.
await p.goto(base + "/logga-in")
await p.waitForSelector("#email, form")
await p.waitForTimeout(150)
check(!(await shown(p, "start")), "ingen ny startskärm på nästa sida under samma appstart")

// Ny appstart (ny session): startskärmen igen.
const app2 = await browser.newContext({ ...iphone, userAgent: nativeUA })
const p2 = await app2.newPage()
listen(p2)
await p2.goto(base + "/logga-in", { waitUntil: "commit" })
await splash(p2, "start").waitFor({ state: "attached" })
check(await shown(p2, "start"), "ny appstart: startskärmen visas igen")
await app2.close()

// På webben (inte mobilappen) syns inloggningen direkt.
const web = await browser.newContext({ ...iphone })
const w = await web.newPage()
listen(w)
await w.goto(base + "/kom-igang")
await w.waitForTimeout(100)
check(!(await shown(w, "start")), "på webben: ingen startskärm över inloggningen")
await web.close()

// ------------------------- 2. inloggning → övergång in i appen (v72) ---
if (supabaseMode) {
  const rest = []
  p.on("request", (r) => {
    if (/:54321\/rest\/v1\//.test(r.url())) rest.push({ url: r.url(), at: Date.now() })
  })
  await p.goto(base + "/logga-in")
  await p.fill("#email", "sara@test.se")
  await p.fill("#password", "hemligt123")
  const clicked = Date.now()
  await p.click("button[type=submit]")
  await p.locator("button[type=submit] svg.animate-spin").waitFor({ timeout: 3000 })
  ok("knappen visar att inloggningen pågår (medan datan hämtas)")
  // Inloggningen tonas ut innan appen laddas.
  await p.waitForFunction(() => Number(getComputedStyle(document.querySelector("main")).opacity) < 0.9, null, { timeout: 15000 })
  ok("inloggningen tonas ut")
  const anySplash = await p.evaluate(() => [...document.querySelectorAll("[data-testid=boot-splash]")].some((el) => getComputedStyle(el).display !== "none"))
  check(!anySplash, "ingen laddningsskärm vid inloggningen")
  await p.waitForURL(`${base}/klient`, { timeout: 20000 })
  const arrived = Date.now()
  const before = rest.filter((r) => r.at < arrived).length
  check(before > 0, `appens data hämtades före sidbytet (${before} anrop)`)
  check(await p.evaluate(() => document.documentElement.classList.contains("app-enter")), "appen vet att datan redan finns (html.app-enter)")
  const splashShown = await p.evaluate(() => {
    const el = document.querySelector("[data-testid=boot-splash]")
    return el ? getComputedStyle(el).display !== "none" : false
  })
  check(!splashShown, "ingen laddningsskärm när appen öppnas efter inloggningen")
  await p.waitForSelector("[data-testid=client-bottom-nav] a", { state: "attached" })
  const anim = await p.evaluate(() => ({ main: getComputedStyle(document.querySelector("main")).animationName, nav: getComputedStyle(document.querySelector("[data-testid=client-bottom-nav]")).animationName }))
  check(anim.main === "app-enter-rise" && anim.nav === "app-enter-nav", `appen tonas in: innehållet glider upp och menyn glider in (${anim.main}, ${anim.nav})`)
  const ready = Date.now() - arrived
  await p.waitForFunction(() => !document.documentElement.classList.contains("app-enter"), null, { timeout: 4000 })
  ok("ingången spelas en gång (klassen tas bort efteråt)")
  const afterHandoff = rest.filter((r) => r.at >= arrived).length
  check(await p.evaluate(() => sessionStorage.getItem("coavira:handoff") === null), "överlämningen förbrukas (gäller en gång)")
  await p.screenshot({ path: `${process.argv[2] ?? "/tmp"}/v72-efter-inloggning.png` }).catch(() => {})

  // Jämförelse: samma sida utan överlämning hämtar allt på nytt – och visar laddningsskärmen.
  const reloadStart = Date.now()
  await p.reload({ waitUntil: "commit" })
  check(!(await p.evaluate(() => document.documentElement.classList.contains("app-enter"))), "vid vanlig laddning: ingen ingångsövergång")
  await p.waitForSelector("[data-testid=client-bottom-nav] a")
  const control = rest.filter((r) => r.at >= reloadStart).length
  check(afterHandoff < control / 2, `appen visar överlämnad data direkt: ${afterHandoff} databasanrop efter sidbytet mot ${control} vid vanlig laddning`)
  console.log(`     (${arrived - clicked} ms från klick till appens sida, ${ready} ms till appen syns)`)
}

await app.close()
check(errors.length === 0, `inga konsolfel${errors.length ? ": " + errors.slice(0, 3).join(" | ") : ""}`)
await browser.close()
