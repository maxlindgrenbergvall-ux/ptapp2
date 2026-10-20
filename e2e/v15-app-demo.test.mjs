// E2E för mobilappen (steg 3) i demoläget, med en låtsas-brygga som beter sig
// som Capacitor i iOS/Android-appen: djuplänkar, kall start från länk,
// push-inställning och notistryck, safe area (statusfält/notch) och att
// webben utan app är opåverkad.
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v15-app-demo.test.mjs [skärmdumpsmapp]
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
  p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`${p.url()} console: ${m.text()}`))
}

// ------------------------------------------------------------- i appen ---
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: APP_UA, isMobile: true, hasTouch: true })
await ctx.addInitScript(installNativeFake)
const p = await ctx.newPage()
watch(p)
await p.goto(base + "/klient")
await p.waitForSelector("text=Dagens träning")
await p.waitForFunction(() => window.__native.count("App", "addListener") > 0)
ok("appen registrerar djuplänkslyssnare")
check((await p.getAttribute('meta[name="viewport"]', "content")).includes("viewport-fit=cover"), "helskärm i appen (viewport-fit=cover)")

// Safe area: Capacitor (Android) sätter --safe-area-inset-top; iOS ger env().
await p.evaluate(() => {
  document.documentElement.style.setProperty("--safe-area-inset-top", "47px")
  document.documentElement.style.setProperty("--safe-area-inset-bottom", "34px")
})
const header = await p.locator("header").first().evaluate((el) => ({ pt: getComputedStyle(el).paddingTop, h: el.getBoundingClientRect().height }))
check(header.pt === "47px" && Math.round(header.h) === 56 + 47, `sidhuvudet hamnar under statusfältet (padding ${header.pt}, höjd ${Math.round(header.h)} px)`)
const nav = await p.locator("nav").last().evaluate((el) => getComputedStyle(el).paddingBottom)
check(nav === "34px", `bottenmenyn lämnar plats för hemindikatorn (${nav})`)
await p.screenshot({ path: `${out}/v15-app-safe-area.png` })

// Djuplänkar: bara interna sökvägar.
await p.evaluate(() => window.__native.emit("App", "appUrlOpen", { url: "https://evil.example/klient" }))
await p.evaluate(() => window.__native.emit("App", "appUrlOpen", { url: "com.coavira.app:////evil.example" }))
await p.waitForTimeout(800)
check(new URL(p.url()).pathname === "/klient", "djuplänkar till andra domäner ignoreras")
await p.evaluate(() => window.__native.emit("App", "appUrlOpen", { url: "com.coavira.app://klient/kalender" }))
await p.waitForURL(base + "/klient/kalender")
ok("com.coavira.app://klient/kalender öppnar kalendern")
await p.waitForFunction(() => window.__native?.count("App", "addListener") > 0)
await p.evaluate((b) => window.__native.emit("App", "appUrlOpen", { url: `${b}/klient/framsteg` }), base)
await p.waitForURL(base + "/klient/framsteg")
ok("appens egen https-länk öppnas i appen")

// Push: frågar först när användaren slår på det.
await p.goto(base + "/klient/installningar")
const card = p.locator("[data-testid=push-settings]")
await card.waitFor()
check((await p.evaluate(() => window.__native.count("PushNotifications", "requestPermissions"))) === 0, "appen frågar inte om notiser vid start")
await card.locator('[role=checkbox]').click()
await p.waitForSelector("text=Push-notiser är påslagna")
check((await p.evaluate(() => window.__native.count("PushNotifications", "register"))) === 1, "påslaget push: tillstånd och registrering")
await p.evaluate(() => window.__native.emit("PushNotifications", "registration", { value: "fcm-token-abcdefghijklmnopqrstuvwxyz" }))
await p.waitForFunction(() => localStorage.getItem("coavira:push:token") === "fcm-token-abcdefghijklmnopqrstuvwxyz")
ok("enhetens push-token sparas")
await p.screenshot({ path: `${out}/v15-app-push.png`, fullPage: true })
await p.evaluate(() =>
  window.__native.emit("PushNotifications", "pushNotificationActionPerformed", { actionId: "tap", notification: { data: { url: "/klient/chatt" } } })
)
await p.waitForURL(base + "/klient/chatt")
ok("tryck på notisen öppnar chatten")
await p.waitForFunction(() => window.__native?.count("PushNotifications", "register") > 0)
ok("push registreras om vid nästa start (token kan bytas)")
await p.evaluate(() =>
  window.__native.emit("PushNotifications", "pushNotificationActionPerformed", { actionId: "tap", notification: { data: { url: "https://evil.example/" } } })
)
await p.waitForTimeout(800)
check(new URL(p.url()).pathname === "/klient/chatt", "notiser med externa länkar ignoreras")
await ctx.close()

// Kall start från en länk: öppnas en gång, ingen omladdningsloop.
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: APP_UA })
await ctx2.addInitScript(installNativeFake, { launchUrl: "com.coavira.app://klient/kalender" })
const p2 = await ctx2.newPage()
watch(p2)
let navigations = 0
p2.on("load", () => navigations++)
await p2.goto(base + "/klient")
await p2.waitForURL(base + "/klient/kalender")
await p2.waitForTimeout(2500)
check(new URL(p2.url()).pathname === "/klient/kalender" && navigations === 2, `kall start från länk öppnar kalendern en gång (${navigations} sidladdningar)`)
await ctx2.close()

// --------------------------------------------- vanlig webbläsare (webben) ---
const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } })
const p3 = await ctx3.newPage()
watch(p3)
await p3.goto(base + "/klient/installningar")
await p3.waitForSelector("text=Utseende")
check((await p3.locator("[data-testid=push-settings]").count()) === 0, "webben visar ingen push-inställning")
const webHeader = await p3.locator("header").first().evaluate((el) => getComputedStyle(el).paddingTop)
check(webHeader === "0px", "webben har inga extra marginaler")
await ctx3.close()

// App Links / Universal Links: tomma tills certifikat och Team ID finns.
for (const path of ["/.well-known/assetlinks.json", "/.well-known/apple-app-site-association"]) {
  const res = await fetch(base + path)
  check(res.status === (process.env.APPLE_TEAM_ID || process.env.ANDROID_APP_SHA256 ? 200 : 404), `${path} svarar ${res.status} utan nycklar`)
}

console.log(errors.length ? `sidfel:\n${errors.join("\n")}` : "inga sidfel")
if (errors.length) process.exitCode = 1
await browser.close()
