// Skärmdumpar till App Store (iPhone 6,9": 1320×2868) från demoläget.
//   npm run build && npm start (utan Supabase-variabler), sedan: node scripts/store-screenshots.mjs
import { chromium } from "playwright"
const base = process.env.BASE_URL ?? "http://localhost:3000"
const out = new URL("../mobile/store/ios", import.meta.url).pathname
const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) })
const ctx = await browser.newContext({
  viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  colorScheme: "light",
})
const p = await ctx.newPage()
const shot = async (path, name, ready) => {
  await p.goto(base + path)
  if (ready) await p.waitForSelector(ready)
  await p.waitForTimeout(1200)
  // Demolägets förklaringar hör inte hemma i butiksbilderna.
  await p.addStyleTag({ content: "[data-sonner-toaster]{display:none!important}" })
  await p.evaluate(() => document.querySelectorAll("p,div,span").forEach((el) => { if (/^Demoläge/.test(el.textContent?.trim() ?? "") && el.children.length < 3) el.style.display = "none" }))
  await p.screenshot({ path: `${out}/${name}.png` })
  console.log("ok", name)
}
await shot("/klient", "1-idag", "text=Dagens kost")
await shot("/klient/framsteg", "2-framsteg", "text=Senaste passen")
await shot("/klient/hitta", "3-hitta-pt", "text=Hitta din PT")
await shot("/klient/kalender", "4-kalender")
await shot("/klient/chatt", "5-chatt")
await browser.close()
