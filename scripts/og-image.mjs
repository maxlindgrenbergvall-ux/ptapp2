// Skapar delningsbilden public/og-image.png (1200×630, Open Graph/Twitter) av
// den riktiga appen: telefonen från landningssidans hero + rubrik och logga.
//   1. Starta sidan: npm run build && npx next start   (eller npm run dev)
//   2. BASE_URL=http://localhost:3000 node scripts/og-image.mjs
// Kör om när hero-telefonen eller rubriken ändras.
import fs from "node:fs"
import path from "node:path"
import { chromium } from "playwright"

const base = process.env.BASE_URL ?? "http://localhost:3000"
const root = path.resolve(import.meta.dirname, "..")
const out = path.join(root, "public/og-image.png")
const font = (f) => fs.readFileSync(path.join(root, "node_modules/next/dist/next-devtools/server/font", f)).toString("base64")

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})

// 1. Telefonen ur hero (rak, utan lutning och svävande brickor), i dubbel upplösning.
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: "reduce" })
const page = await ctx.newPage()
await page.goto(`${base}/`, { waitUntil: "networkidle" })
await page.waitForTimeout(1500)
const phone = await page.evaluateHandle(() => {
  const src = document.querySelector("#hero-title")?.closest("section")?.querySelector('[class*="rounded-[2.75rem]"]')
  if (!src) throw new Error("Hittar inte telefonen i hero")
  // Bara telefonen på genomskinlig bakgrund: inga brickor, ingen lutning (.landing ger det mörka temat).
  const wrap = document.createElement("div")
  wrap.className = "landing"
  wrap.style.cssText = "position:fixed;left:40px;top:40px;background:transparent;padding:0"
  const el = src.cloneNode(true)
  wrap.append(el)
  document.body.replaceChildren(wrap)
  document.documentElement.style.background = "transparent"
  document.body.style.background = "transparent"
  return el
})
const phonePng = (await phone.asElement().screenshot({ omitBackground: true })).toString("base64")
await ctx.close()

// 2. Bilden: logga och rubrik till vänster, telefonen till höger.
const og = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await og.setContent(`<!doctype html><html lang="sv"><head><meta charset="utf-8"><style>
  @font-face { font-family: Geist; src: url(data:font/woff2;base64,${font("geist-latin.woff2")}) format("woff2"); font-weight: 100 900; unicode-range: U+0000-00FF, U+2013-2014, U+2019, U+201C-201D, U+2022; }
  @font-face { font-family: Geist; src: url(data:font/woff2;base64,${font("geist-latin-ext.woff2")}) format("woff2"); font-weight: 100 900; }
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; overflow: hidden; font-family: Geist, sans-serif; color: #f4f7f2; background:
    radial-gradient(620px 520px at 82% 52%, rgba(172,237,55,.20), transparent 70%),
    radial-gradient(520px 420px at 8% 100%, rgba(16,185,129,.16), transparent 70%), #0a0d12; }
  .grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px); background-size: 48px 48px; mask-image: radial-gradient(ellipse 70% 80% at 40% 50%, black, transparent 80%); }
  .left { position: absolute; left: 72px; top: 64px; bottom: 64px; width: 640px; display: flex; flex-direction: column; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 18px; font-size: 40px; font-weight: 700; letter-spacing: -1px; }
  .mark { width: 64px; height: 64px; border-radius: 18px; background: #aced37; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 48px -6px rgba(172,237,55,.55); }
  h1 { font-size: 78px; line-height: 1.02; letter-spacing: -3.5px; font-weight: 800; }
  .g { background: linear-gradient(90deg, #c4f25a, #34d399); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .sub { margin-top: 22px; font-size: 27px; line-height: 1.35; color: #b9c2bb; max-width: 600px; }
  .chips { display: flex; gap: 12px; }
  .chip { display: flex; align-items: center; gap: 10px; padding: 12px 20px; border-radius: 999px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.05); font-size: 22px; font-weight: 600; }
  .dot { width: 10px; height: 10px; border-radius: 99px; background: #aced37; }
  .phone { position: absolute; right: 70px; top: 46px; width: 330px; transform: rotate(4deg); filter: drop-shadow(0 40px 60px rgba(0,0,0,.6)); }
</style></head><body>
  <div class="grid"></div>
  <div class="left">
    <div class="brand"><div class="mark"><svg width="42" height="42" viewBox="0 0 24 24" fill="none"><path d="M17.2 7.2A7 7 0 1 0 17.2 16.8" stroke="#0e1a01" stroke-width="2.8" stroke-linecap="round"/><circle cx="18.6" cy="12" r="2" fill="#0e1a01"/></svg></div>Coavira</div>
    <div>
      <h1><span class="g">Träning och kost.</span><br>På dina villkor.</h1>
      <p class="sub">Din PT, ditt kostschema och dina pass – i en och samma app.</p>
    </div>
    <div class="chips"><div class="chip"><span class="dot"></span>iPhone &amp; Android</div><div class="chip"><span class="dot"></span>Verifierade PT:er</div></div>
  </div>
  <img class="phone" src="data:image/png;base64,${phonePng}" alt="">
</body></html>`)
await og.evaluate(() => document.fonts.ready)
await og.screenshot({ path: out, type: "png" })
await browser.close()
console.log(`Skapade ${path.relative(root, out)} (${Math.round(fs.statSync(out).size / 1024)} kB)`)
