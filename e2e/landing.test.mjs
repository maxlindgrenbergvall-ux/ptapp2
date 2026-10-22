// E2E för landningssidan (/) på coavira.fit: Coavira är en mobilapp, så sidan
// har App Store-/Google Play-brickor ("Släpps snart" innan publicering) och inga
// inloggnings- eller portallänkar. Struktur, fakta, demos, responsivitet
// (360–1440 px), minska rörelse, SEO-filer/metadata, supportsidan och att
// appen (CoaviraApp) fortfarande börjar på sin inloggning.
//   npm run build && npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/landing.test.mjs [skärmdumpsmapp]
import { chromium } from "playwright"
import fs from "node:fs"

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
  return p
}
/** Scrolla igenom sidan så att alla scroll-animationer har körts. */
const scrollThrough = async (p) => {
  const h = await p.evaluate(() => document.documentElement.scrollHeight)
  const vh = p.viewportSize().height
  for (let y = 0; y < h; y += Math.round(vh * 0.6)) {
    await p.evaluate((v) => window.scrollTo(0, v), y)
    await p.waitForTimeout(150)
  }
  await p.evaluate(() => window.scrollTo(0, 0))
}

// --------------------------------------------------- 1. struktur och fakta ---
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" })
const p = watch(await ctx.newPage())
const res = await p.goto(base + "/", { waitUntil: "networkidle" })
check(res.status() === 200, "landningssidan svarar 200")
check((await p.title()).startsWith("Coavira – Framtidens tränings- och kostapp"), `sidtitel: ${await p.title()}`)
check((await p.locator("h1").count()) === 1, "exakt en h1")
const h1 = (await p.locator("h1").innerText()).replace(/\s+/g, " ")
check(/Träning och kost\. ?På dina villkor\./.test(h1), `rubriken: "${h1}"`)
check((await p.locator("text=Koppla samman med din PT").first().isVisible()), "underrubriken syns")
// Ingen säljretorik om betalningar eller tomma AI-fraser.
const heroText = await p.locator("#hero-title").evaluate((el) => el.closest("section")?.innerText ?? "")
check(!/betalningskrångel|framtidens|sömlös/i.test(heroText), "hero utan betalningskrångel/AI-fraser")
const bg = await p.evaluate(() => getComputedStyle(document.querySelector(".landing")).backgroundColor)
check(/rgb\(10, 13, 18\)|#0a0d12/i.test(bg), `alltid mörk bakgrund även i ljust systemtema (${bg})`)
for (const id of ["funktioner", "mal", "kommunikation", "priser", "ladda-ned"]) {
  check((await p.locator(`#${id}`).count()) === 1, `sektionen #${id} finns`)
}
check((await p.locator("footer").count()) >= 1, "sidfot finns")
await scrollThrough(p)
const text = await p.locator("body").innerText()
// Hårda affärsregler och inga påhittade siffror.
// "Inga gratispass" är regeln själv; allt annat om gratis pass är förbjudet.
check(!/gratis ?(pass|provpass|träningspass)|provpass|prova gratis/i.test(text.replace(/inga gratispass/gi, "")), "inga gratispass utlovas")
check(!/\d[\d\s]*\+?\s*(nöjda\s)?(användare|kunder|klienter|PT:er) (använder|litar|har)/i.test(text), "inga påhittade användarsiffror")
check(!/(★|⭐|4,\d av 5|betyg \d)/i.test(text), "inga påhittade betyg")
check(!/(ladda ner|finns) (i|på) (App Store|Google Play)/i.test(text), "påstår inte att appen finns i butikerna")
check(!/(provision|plattformsavgift|månadsavgift|abonnemang)\D{0,20}\d/i.test(text), "inga påhittade PT-avgifter")
check(!/betalningskrångel|krångel med betalning/i.test(text), "ingen betalningskrångel-retorik")

// Länkar
const hrefs = await p.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")))
// Ingen webbportal: inga inloggnings-, registrerings- eller app-sidor länkas.
const portal = hrefs.filter((h) => /^\/(kom-igang|logga-in|registrera|klient|pt|dashboard|valkommen)(\/|$|\?)/.test(h ?? ""))
check(portal.length === 0, `inga inloggnings-/portallänkar (${portal.join(", ") || "inga"})`)
check(!/Logga in|Registrera|PT-inloggning|Kom igång/.test(text), "ingen inloggningstext på sidan")
for (const h of ["/support", "/integritet", "/villkor"]) check(hrefs.includes(h), `länk till ${h} (krävs av App Store/Google Play)`)
const iosBadges = await p.locator("[data-store=ios]").count()
const androidBadges = await p.locator("[data-store=android]").count()
check(iosBadges >= 4 && androidBadges >= 4, `butiksbrickor överallt (App Store ${iosBadges}, Google Play ${androidBadges})`)
check(await p.locator("[data-store=ios]").first().innerText().then((t) => /Hämta i\s*App Store/.test(t)), "App Store-brickan: Hämta i App Store")
check(await p.locator("[data-store=android]").first().innerText().then((t) => /Ladda ned på\s*Google Play/i.test(t)), "Google Play-brickan: Ladda ned på Google Play")
check(hrefs.some((h) => h?.startsWith("mailto:certifiering@coavira.fit")), "PT-ansökan via certifiering@coavira.fit")
check(hrefs.some((h) => h?.startsWith("mailto:kontakt@coavira.fit")), "kontaktlänk i sidfoten (coavira.fit)")

// "Släpps snart" när apparna inte är publicerade än.
await p.locator("[data-store=ios]").first().click()
const soon = p.locator("[data-testid=coming-soon]")
await soon.waitFor()
check(/App Store/.test(await soon.innerText()) && /släpps snart/i.test(await soon.innerText()), "App Store-brickan visar Släpps snart")
await p.keyboard.press("Escape")
await soon.waitFor({ state: "detached" })
await p.locator("#ladda-ned [data-store=android]").scrollIntoViewIfNeeded()
await p.locator("#ladda-ned [data-store=android]").click()
await soon.waitFor()
check((await soon.innerText()).includes("Google Play"), "Google Play-brickan visar Släpps snart")
await p.screenshot({ path: `${out}/landing-slapps-snart.png` })
await p.locator('[data-testid=coming-soon] button[aria-label="Stäng"]').click()
await soon.waitFor({ state: "detached" })
ok("rutan stängs")
await p.screenshot({ path: `${out}/landing-desktop.png` })

// ------------------------------------------------- 2. interaktiva demos ---
// Mål: välj Löpning → Framsteg visar löpningens mätpunkter.
await p.locator("#mal").scrollIntoViewIfNeeded()
const running = p.locator('#mal button[aria-pressed]', { hasText: "Löpning" }).first()
await running.click()
check((await running.getAttribute("aria-pressed")) === "true", "målet Löpning kan väljas")
await p.waitForFunction(() => document.querySelector("#mal")?.textContent?.includes("Bästa tid 5 km"))
ok("Framsteg-vyn byggs om med löpningens mätpunkter (Bästa tid 5 km)")
await running.click()
check((await running.getAttribute("aria-pressed")) === "false", "målet kan väljas bort")

// Kost: byt enhet för havregryn (appens riktiga enhetslogik).
const oats = p.locator('#funktioner [role=group][aria-label="Enhet för Havregryn"]')
await oats.scrollIntoViewIfNeeded()
const unitButtons = await oats.locator("button").allInnerTexts()
check(unitButtons.map((t) => t.trim()).join(",") === "g,dl", `havregryn: bara g och dl (${unitButtons.join(", ")})`)

// Chatt: videosamtal med flyttbar kameraruta.
await p.locator("#kommunikation").scrollIntoViewIfNeeded()
await p.locator("#kommunikation button", { hasText: "Testa videosamtalet" }).click()
const self = p.locator('[aria-label="Din kameraruta – dra eller använd piltangenterna"]')
await self.waitFor()
const b1 = await self.boundingBox()
await self.focus()
for (let i = 0; i < 6; i++) await p.keyboard.press("ArrowUp")
await p.waitForTimeout(500)
const b2 = await self.boundingBox()
check(Math.abs(b2.y - b1.y) > 10 || Math.abs(b2.x - b1.x) > 10, `kamerarutan flyttas med piltangenterna (${Math.round(b1.y)} → ${Math.round(b2.y)})`)
await p.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2)
await p.mouse.down()
await p.mouse.move(b2.x - 150, b2.y + 120, { steps: 10 })
await p.mouse.up()
await p.waitForTimeout(700)
const b3 = await self.boundingBox()
check(Math.abs(b3.x - b2.x) > 20 || Math.abs(b3.y - b2.y) > 20, "kamerarutan kan dras")
await p.screenshot({ path: `${out}/landing-videosamtal.png` })
await p.locator('#kommunikation button[aria-label="Lägg på"]').first().click()
await self.waitFor({ state: "detached" })
ok("samtalet kan avslutas")

// Priser: PT-fliken och mersälj av kostcoaching.
await p.locator("#priser").scrollIntoViewIfNeeded()
await p.locator('#priser [role=tab]', { hasText: "För PT:er" }).click()
await p.waitForSelector("#priser a[href^='mailto:certifiering@coavira.fit']")
ok("PT-fliken visar ansökan")
const upsell = p.locator("#priser button", { hasText: "Lägg till kostcoaching" }).first()
await upsell.scrollIntoViewIfNeeded()
await upsell.click()
await p.locator('#priser [role=group][aria-label="Mersälj: kostcoaching"] button').first().click()
await p.waitForSelector("#priser >> text=Tillagt!")
ok("mersälj: kostcoaching läggs till")
await ctx.close()

// ------------------------------------------------- 3. mobil och menyn ---
for (const width of [360, 390, 768, 1024, 1440]) {
  const c = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 1024, hasTouch: width < 1024 })
  const m = watch(await c.newPage())
  await m.goto(base + "/", { waitUntil: "networkidle" })
  await scrollThrough(m)
  const sideways = await m.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  check(!sideways, `ingen sidledsscroll i ${width} px`)
  if (width === 390) {
    await m.click('button[aria-controls="landing-mobilmeny"]')
    await m.waitForTimeout(500)
    check(await m.locator("header a[href='#priser'] >> visible=true").count() > 0, "mobilmenyn öppnas med ankarlänkar")
    await m.keyboard.press("Escape")
    await m.waitForTimeout(500)
    check((await m.locator("header button[aria-expanded=true]").count()) === 0, "Escape stänger mobilmenyn")
    await m.screenshot({ path: `${out}/landing-mobil.png` })
  }
  await c.close()
}

// Minska rörelse: allt innehåll syns ändå.
const rc = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" })
const r = watch(await rc.newPage())
await r.goto(base + "/", { waitUntil: "networkidle" })
await scrollThrough(r)
await r.locator("#priser").scrollIntoViewIfNeeded()
await r.waitForTimeout(600)
const op = await r.locator("#priser h2").evaluate((el) => {
  let o = 1
  for (let n = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity)
  return o
})
check(op > 0.95, `med "minska rörelse" syns innehållet (opacitet ${op.toFixed(2)})`)
await rc.close()

// --------------------------------------- 4. appen, SEO och övriga sidor ---
const app = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: "Mozilla/5.0 (iPhone) Mobile CoaviraApp" })
const a = watch(await app.newPage())
await a.goto(base + "/")
await a.waitForURL(base + "/kom-igang")
check(await a.locator("text=Fortsätt med Google").isVisible(), "appen (iOS/Android) börjar på Kom igång, inte på landningssidan")
await app.close()

const robots = await (await fetch(base + "/robots.txt")).text()
check(/Disallow: \/klient/.test(robots) && /Sitemap: https?:\/\//.test(robots), "robots.txt stänger appens sidor och pekar på sitemap")
const sitemap = await (await fetch(base + "/sitemap.xml")).text()
check(sitemap.includes("https://coavira.fit/support") && sitemap.includes("/villkor") && !sitemap.includes("/kom-igang"), "sitemap.xml: coavira.fit, support/villkor, ingen inloggning")
check(/Sitemap: https:\/\/coavira\.fit\/sitemap\.xml/.test(robots), "robots.txt pekar på coavira.fit")
const og = await fetch(base + "/og-image.png")
check(og.ok && og.headers.get("content-type")?.includes("image/png"), "Open Graph-bild finns")
const page = await (await fetch(base + "/")).text()
check(/<meta property="og:image" content="https:\/\/coavira\.fit\//.test(page), "og:image på coavira.fit")
check(/<link rel="canonical" href="https:\/\/coavira\.fit"/.test(page) && /<meta property="og:url" content="https:\/\/coavira\.fit"/.test(page), "kanonisk adress och og:url = coavira.fit")

const misc = watch(await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage())
await misc.goto(base + "/villkor")
check(await misc.locator("text=Villkor i korthet").isVisible(), "/villkor visas")
await misc.goto(base + "/support")
check(await misc.locator("text=support@coavira.fit").first().isVisible(), "/support visar supportadressen")

console.log(errors.length ? `sidfel:\n${errors.join("\n")}` : "inga sidfel")
if (errors.length) process.exitCode = 1
await browser.close()
