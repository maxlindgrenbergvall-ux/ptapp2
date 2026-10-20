// Ritar källbilderna för appikon och startskärm (mobile/assets) ur Coaviras
// märke – samma som src/app/icon.svg. Kör sedan `npm run mobile:assets` för att
// skapa alla storlekar för iOS och Android (@capacitor/assets).
//   node scripts/mobile-icons.mjs
import { chromium } from "playwright"

const BRAND = "#aced37"
const INK = "#0e1a01"
const DARK = "#0b0f0d"
const out = new URL("../mobile/assets/", import.meta.url).pathname

/** Märket (C med punkt) centrerat, `scale` = andel av bildens bredd. */
const mark = (color, scale) => `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width:${scale * 100}%;height:${scale * 100}%">
    <path d="M17.2 7.2A7 7 0 1 0 17.2 16.8" fill="none" stroke="${color}" stroke-width="2.8" stroke-linecap="round"/>
    <circle cx="18.6" cy="12" r="2" fill="${color}"/>
  </svg>`

const images = [
  // App Store-ikonen får inte ha genomskinlighet; iOS rundar hörnen själv.
  { file: "icon-only.png", size: 1024, bg: BRAND, html: mark(INK, 0.62) },
  // Android adaptiv ikon: förgrunden ska rymmas i mittersta ~66 %.
  { file: "icon-foreground.png", size: 1024, bg: "transparent", html: mark(INK, 0.42) },
  { file: "icon-background.png", size: 1024, bg: BRAND, html: "" },
  { file: "splash.png", size: 2732, bg: BRAND, html: mark(INK, 0.16) },
  { file: "splash-dark.png", size: 2732, bg: DARK, html: mark(BRAND, 0.16) },
]

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
for (const img of images) {
  const page = await browser.newPage({ viewport: { width: img.size, height: img.size } })
  await page.setContent(
    `<html><body style="margin:0;width:${img.size}px;height:${img.size}px;display:flex;align-items:center;justify-content:center;background:${img.bg}">${img.html}</body></html>`
  )
  await page.screenshot({ path: out + img.file, omitBackground: img.bg === "transparent" })
  await page.close()
  console.log("skapad", "mobile/assets/" + img.file)
}
await browser.close()
