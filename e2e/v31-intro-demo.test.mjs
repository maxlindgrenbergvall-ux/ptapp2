// E2E för v31 i demoläge: välkomststeget (utan namn) → steg 1 (förnamn,
// efternamn, profilbild med bildfiltret) → klientens mål och grafer.
// PT-flödet (profil → Stripe → villkor) testas i connect-onboarding-demo.
//   npm run build && MODERATION_TEST_BLOCK_COLOR=ff00ff npm start   (utan Supabase-variabler)
//   BASE_URL=http://localhost:3000 node e2e/v31-intro-demo.test.mjs [skärmdumpsmapp]
import { chromium } from "playwright"
import fs from "node:fs"
import sharp from "sharp"

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

const noise = Buffer.alloc(96 * 96 * 3)
for (let i = 0; i < noise.length; i++) noise[i] = (i * 73 + (i >> 5) * 31) % 256
const normalPng = await sharp(noise, { raw: { width: 96, height: 96, channels: 3 } }).png().toBuffer()
const blockedPng = await sharp({ create: { width: 96, height: 96, channels: 3, background: "#ff00ff" } }).png().toBuffer()

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`${p.url()} pageerror: ${e.message}`))
p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`${p.url()} console: ${m.text()}`))
const demo = () => p.evaluate(() => JSON.parse(localStorage["coavira:demo:v5"]).data)

await p.goto(base + "/valkommen")
check((await p.locator("#name").count()) === 0, "välkomststeget frågar inte efter namnet (det kommer i steg 1)")
await p.locator("#consent").click()
await p.click('button:has-text("Kom igång")')
await p.waitForURL(/\/klient\/intro$/)
await p.waitForSelector("[data-testid=profile-step]")
check((await p.locator("[data-testid=goal-intro] h1").innerText()).includes("Vem är du"), "steg 1 kommer direkt efter registreringen")
check((await p.inputValue("#profile-firstName")).length > 0, "förnamnet är förifyllt")

// Bildfiltret stoppar en olämplig bild direkt i steg 1.
await p.setInputFiles("[data-testid=profile-step] input[type=file]", { name: "olamplig.png", mimeType: "image/png", buffer: blockedPng })
await p.waitForSelector("[data-testid=avatar-blocked]")
check((await p.locator("[data-testid=avatar-blocked]").innerText()).includes("innehållsfilter"), "olämplig profilbild stoppas av bildfiltret med ett tydligt besked")
check((await p.locator("[data-testid=profile-step] img[src^='data:image']").count()) === 0, "den stoppade bilden används inte")
await p.screenshot({ path: `${out}/v31-steg1-stoppad.png` })
await p.setInputFiles("[data-testid=profile-step] input[type=file]", { name: "jag.png", mimeType: "image/png", buffer: normalPng })
await p.waitForFunction(() => document.querySelector("[data-testid=profile-step] img[src^='data:image']"))
ok("en godkänd bild blir profilbild")

await p.fill("#profile-firstName", "Sara")
await p.fill("#profile-lastName", "")
await p.click("[data-testid=intro-next]")
check(await p.locator("#profile-lastName-error").isVisible(), "efternamn krävs")
await p.fill("#profile-lastName", "Lind Berg")
check(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "steg 1: ingen horisontell overflow på mobilen")
await p.screenshot({ path: `${out}/v31-steg1.png` })
await p.click("[data-testid=intro-next]")
await p.waitForSelector("text=Dina mått")
const c1 = (await demo()).clients.find((c) => c.id === "c1")
check(c1.name === "Sara Lind Berg" && c1.avatarUrl?.startsWith("data:image"), "namn och profilbild sparas i profilen")

// Rollens nästa steg: mål och grafer.
await p.fill("#goal-weightKg", "")
await p.fill("#goal-weightKg", "68")
await p.fill("#goal-heightCm", "170")
await p.fill("#goal-age", "30")
await p.click('[role=radio]:has-text("Kvinna")')
await p.click("[data-testid=intro-next]")
await p.click('[data-testid=activity-picker] [role=radio]:has-text("Medel")')
await p.click("[data-testid=intro-next]")
await p.click('[data-testid=goal-picker] button:has-text("Viktnedgång")')
await p.click('[data-testid=goal-picker] button:has-text("Ökad muskelmassa")')
await p.click("[data-testid=intro-next]")
await p.waitForSelector("[data-testid=goal-chart]")
check((await p.locator("[data-testid=goal-chart]").getAttribute("data-series")) === "fatDelta,leanDelta", "klient: grafer för fett och muskler")
check(await p.locator("[data-testid=goal-disclaimer]").isVisible(), "friskrivningen längst ned")
check(await p.locator("[data-testid=rate-slider]").isVisible(), "aggressivitetsreglaget finns")
await p.click("[data-testid=intro-next]")
await p.waitForURL(base + "/klient")
check((await demo()).goalProfiles.some((g) => g.clientId === "c1"), "målen sparas och klienten kommer in i appen")

// Framsteg: de nya interaktiva graferna (plan mot verklighet) ersätter den gamla viktgrafen.
await p.goto(base + "/klient/framsteg")
await p.waitForSelector("[data-testid=goal-progress]")
await p.locator("[data-testid=goal-progress]").scrollIntoViewIfNeeded()
await p.waitForFunction(() => document.querySelectorAll("[data-testid=goal-progress] .recharts-line").length >= 3)
check((await p.locator("[data-testid=goal-progress] .recharts-line").count()) === 3, "Framsteg: fett, muskler och faktisk vikt i samma graf")
check((await p.locator("[data-testid=goal-progress] [data-testid=goal-disclaimer]").count()) === 1, "Framsteg: friskrivningen under grafen")
await p.screenshot({ path: `${out}/v31-framsteg.png`, fullPage: true })

check(errors.length === 0, `inga sidfel${errors.length ? `: ${errors.join(" | ")}` : ""}`)
await browser.close()
