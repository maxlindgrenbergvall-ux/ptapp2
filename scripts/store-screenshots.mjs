// Butiksbilder till App Store (iPhone 6,9": 1320×2868, iPhone Duo: 5244×2950) i landningssidans stil.
//
//   npm run build && npm start   (utan Supabase-variabler = demoläge)
//   node scripts/store-screenshots.mjs
//
// 1. Fotograferar appen i demoläget          → mobile/store/ios/raw/app-*.png
// 2. Fotograferar landningssidans telefoner
//    och kort (samma grafik som coavira.fit) → mobile/store/ios/raw/landing-*.png
// 3. Sätter ihop butiksbilderna med rubriker → mobile/store/ios/01-….png
// 4. Liggande bilder för iPhone Duo (5244×2950) → mobile/store/ios/duo/01-….png
// Typsnitt och stilar hämtas från sajten, så bilderna matchar landningssidan.
// REUSE_RAW=1 hoppar över steg 1–2 och använder bilderna i raw/.
import fs from "node:fs"
import { chromium } from "playwright"

const base = process.env.BASE_URL ?? "http://localhost:3000"
const out = new URL("../mobile/store/ios", import.meta.url).pathname
const raw = `${out}/raw`
fs.mkdirSync(raw, { recursive: true })
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})

const reuse = process.env.REUSE_RAW === "1"

// ------------------------------------------------------------ 1. appen ---
if (!reuse) {
  const ctx = await browser.newContext({
    viewport: { width: 440, height: 956 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
    colorScheme: "light",
  })
  const p = await ctx.newPage()
  const shot = async (path, name, ready) => {
    await p.goto(base + path)
    if (ready) await p.waitForSelector(ready)
    await p.waitForTimeout(1200)
    await p.addStyleTag({ content: "[data-sonner-toaster]{display:none!important}" })
    // Demolägets förklaringar hör inte hemma i butiksbilderna.
    await p.evaluate(() =>
      document.querySelectorAll("p,div,span").forEach((el) => {
        if (/^Demoläge/.test(el.textContent?.trim() ?? "") && el.children.length < 3) el.style.display = "none"
      })
    )
    await p.screenshot({ path: `${raw}/${name}.png` })
    console.log("app", name)
  }
  await shot("/klient", "app-1-idag", "text=Dagens kost")
  await shot("/klient/framsteg", "app-2-framsteg", "text=Senaste passen")
  await shot("/klient/hitta", "app-3-hitta-pt", "text=Hitta din PT")
  await shot("/klient/kalender", "app-4-kalender")
  await shot("/klient/chatt", "app-5-chatt")
  await ctx.close()
}

// --------------------------------------------------- 2. landningssidan ---
if (!reuse) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3, reducedMotion: "reduce" })
  const p = await ctx.newPage()
  await p.goto(base + "/")
  // Rulla igenom sidan så att alla demon startar och laddar klart.
  for (let y = 0; y < 12000; y += 500) {
    await p.mouse.wheel(0, 500)
    await p.waitForTimeout(150)
  }
  await p.waitForTimeout(1500)
  await p.addStyleTag({ content: "[data-sonner-toaster]{display:none!important}" })

  /** Kortet som innehåller rubriken (h3) – samma bentokort som på sajten. */
  const card = (title) =>
    p.locator("h3", { hasText: title }).first().locator("xpath=ancestor::div[contains(@class,'rounded-3xl') and contains(@class,'overflow-hidden')][1]")
  /** Telefonen (mockupen) runt en text. */
  const phone = (text, nth = 0) =>
    p.getByText(text, { exact: true }).nth(nth).locator("xpath=ancestor::div[contains(@class,'rounded-[2.75rem]')][1]")

  const grab = async (loc, name) => {
    await loc.scrollIntoViewIfNeeded()
    await p.waitForTimeout(600)
    // Sajtens fasta meny och knappar ska inte komma med i bilderna.
    await p.evaluate(() =>
      document.querySelectorAll("body *").forEach((el) => {
        const pos = getComputedStyle(el).position
        if (pos === "fixed" || pos === "sticky") el.style.visibility = "hidden"
      })
    )
    // Bara elementet syns (inga svävande etiketter från grannar), på genomskinlig bakgrund.
    const handle = await loc.elementHandle()
    await p.evaluate((el) => {
      document.documentElement.style.background = "transparent"
      document.body.style.background = "transparent"
      document.body.style.visibility = "hidden"
      el.style.visibility = "visible"
    }, handle)
    await loc.screenshot({ path: `${raw}/${name}.png`, animations: "disabled", omitBackground: true })
    await p.evaluate((el) => {
      document.documentElement.style.background = ""
      document.body.style.background = ""
      document.body.style.visibility = ""
      el.style.visibility = ""
    }, handle)
    console.log("landning", name)
  }
  await grab(phone("Hej Sara!"), "landing-hero-phone")
  await grab(card("Din PT. Din plan."), "landing-sync")
  await grab(card("Svensk matdatabas i fickan"), "landing-food")
  await grab(card("Boka med din coach"), "landing-calendar")
  await grab(card("Bara verifierade PT:er"), "landing-verified")
  const goals = p.locator("section", { hasText: "Vad vill du uppnå?" })
  await grab(goals.getByText("Dina mål", { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'rounded-[2.75rem]')][1]"), "landing-progress-phone")
  // Chattelefonen (inte PT-kortet längre upp).
  const chat = p.locator("section", { hasText: "Din coach." }).getByText("Elin Söderberg", { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'rounded-[2.75rem]')][1]")
  await grab(chat, "landing-chat-phone")
  await ctx.close()
}

// ------------------------------------------------------- 3. butiksbilder ---
const img = (name) => `data:image/png;base64,${fs.readFileSync(`${raw}/${name}.png`).toString("base64")}`

/** Telefonram runt en riktig skärmdump från appen (övre delen av skärmen). */
const appPhone = (name) => `
  <div class="frame"><div class="screen">
    <img src="${img(name)}" />
    <div class="island"></div>
  </div></div>`

/** Bild med position och vinkel (px i en 440 × 956-yta). */
const at = (html, { left = 0, top = 0, width, rotate = 0, z = 1, cls = "" }) =>
  `<div class="asset ${cls}" style="left:${left}px;top:${top}px;width:${width}px;transform:rotate(${rotate}deg);z-index:${z}">${html}</div>`
const pic = (name, cls = "") => `<img class="${cls}" src="${img(name)}" />`
/** Landningssidans kort är glas (halvgenomskinliga) – här får de en fast mörk botten. Hörnen skalas med kortet. */
const card = (name, width, siteWidth) => `<img class="card" style="border-radius:${(24 * width) / siteWidth}px" src="${img(name)}" />`

const slides = [
  {
    file: "01-start",
    eyebrow: "Appen för dig och din PT",
    title: `Träning och kost.<br><span class="lime">På dina villkor.</span>`,
    sub: "Pass, kostschema, bokning och chatt med din PT – i en app.",
    body: at(pic("landing-hero-phone", "glow"), { left: 64, top: 0, width: 312 }),
  },
  {
    file: "02-din-plan",
    eyebrow: "PT + klient i realtid",
    title: `Din PT.<br><span class="lime">Din plan.</span>`,
    sub: "PT:n bygger passet – du ser det direkt och loggar varje set.",
    body:
      at(card("landing-sync", 404, 761), { left: 18, top: 0, width: 404, rotate: -1.5 }) +
      at(appPhone("app-1-idag"), { left: 150, top: 300, width: 250, rotate: 3, z: 2 }),
  },
  {
    file: "03-kost",
    eyebrow: "Svensk matdatabas",
    title: `Kosten,<br><span class="lime">enkelt.</span>`,
    sub: "Skanna streckkoden eller sök bland svenska livsmedel.",
    body: at(card("landing-food", 300, 371), { left: 70, top: 0, width: 300 }),
  },
  {
    file: "04-boka",
    eyebrow: "Kalender & bokning",
    title: `Boka med<br><span class="lime">din coach.</span>`,
    sub: "Lediga tider, påminnelser och synk med din kalender.",
    body:
      at(card("landing-calendar", 404, 761), { left: 18, top: 0, width: 404, rotate: 1.5 }) +
      at(appPhone("app-4-kalender"), { left: 40, top: 250, width: 250, rotate: -3, z: 2 }),
  },
  {
    file: "05-framsteg",
    eyebrow: "Framsteg efter dina mål",
    title: `Se dina<br><span class="lime">resultat.</span>`,
    sub: "1RM, vikt och mätpunkter räknas fram från dina pass.",
    body: at(pic("landing-progress-phone", "glow"), { left: 62, top: 0, width: 316 }),
  },
  {
    file: "06-chatt",
    eyebrow: "Chatt & samtal",
    title: `Din coach.<br><span class="lime">Ett tryck bort.</span>`,
    sub: "Chatta, skicka teknikvideor och videoring din PT i appen.",
    body: at(pic("landing-chat-phone", "glow"), { left: 64, top: 0, width: 312 }),
  },
  {
    file: "07-hitta-pt",
    eyebrow: "Verifierade PT:er",
    title: `Hitta din<br><span class="lime">PT.</span>`,
    sub: "Granskade tränare nära dig eller på distans – med pris och omdömen.",
    body:
      at(appPhone("app-3-hitta-pt"), { left: 40, top: 0, width: 280, rotate: -2 }) +
      at(card("landing-verified", 196, 371), { left: 226, top: 330, width: 196, rotate: 4, z: 2 }),
  },
]

const css = `
  html,body{margin:0;width:440px;height:956px;overflow:hidden;background:#07090b}
  body{font-family:var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased;color:#fff}
  .page{position:relative;width:440px;height:956px;overflow:hidden;background:#07090b}
  .grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:44px 44px;-webkit-mask-image:radial-gradient(ellipse at 50% 25%,#000 25%,transparent 70%)}
  .glow1{position:absolute;top:-190px;left:50%;width:560px;height:560px;transform:translateX(-50%);border-radius:50%;background:radial-gradient(closest-side,rgba(172,237,55,.30),transparent)}
  .glow2{position:absolute;bottom:-200px;right:-140px;width:480px;height:480px;border-radius:50%;background:radial-gradient(closest-side,rgba(52,211,153,.18),transparent)}
  .head{position:relative;padding:62px 26px 0;text-align:center}
  .chip{display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(172,237,55,.32);background:rgba(172,237,55,.10);color:#c8f55a;border-radius:999px;padding:6px 13px;font-size:11px;font-weight:600;letter-spacing:.12em;text-transform:uppercase}
  .dot{width:6px;height:6px;border-radius:50%;background:#aced37;box-shadow:0 0 10px #aced37}
  h1{margin:18px 0 0;font-size:44px;line-height:1.03;font-weight:700;letter-spacing:-.025em}
  .lime{background:linear-gradient(90deg,#d4f75e,#8be37a);-webkit-background-clip:text;background-clip:text;color:transparent}
  .sub{margin:14px auto 0;max-width:350px;font-size:16px;line-height:1.4;color:rgba(255,255,255,.72)}
  .stage{position:absolute;left:0;right:0;top:300px;bottom:0}
  .asset{position:absolute}
  .asset img{display:block;width:100%}
  .card{background:#11161a;box-shadow:0 30px 80px -10px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.06)}
  .glow{filter:drop-shadow(0 40px 70px rgba(172,237,55,.22))}
  .frame{border-radius:46px;border:1px solid rgba(255,255,255,.16);background:#05070a;padding:9px;box-shadow:0 40px 100px -20px rgba(172,237,55,.35),0 30px 60px -10px rgba(0,0,0,.6)}
  .screen{position:relative;overflow:hidden;border-radius:38px;background:#fff}
  .screen img{display:block;width:100%;aspect-ratio:1320/2300;object-fit:cover;object-position:top}
  .island{position:absolute;left:50%;top:9px;width:86px;height:24px;transform:translateX(-50%);border-radius:999px;background:#000}
`

const page = await (await browser.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3 })).newPage()
await page.goto(base + "/integritet") // samma ursprung som sajtens stilar och typsnitt
const siteCss = await page.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href))
const bodyClass = await page.evaluate(() => `${document.documentElement.className} ${document.body.className}`)
for (const s of slides) {
  await page.setContent(
    `<!doctype html><html lang="sv" class="${bodyClass}"><head><meta charset="utf-8">
    ${siteCss.map((h) => `<link rel="stylesheet" href="${h}">`).join("")}
    <style>${css}</style></head>
    <body class="${bodyClass}"><div class="page">
      <div class="grid"></div><div class="glow1"></div><div class="glow2"></div>
      <div class="head">
        <span class="chip"><span class="dot"></span>${s.eyebrow}</span>
        <h1>${s.title}</h1>
        <p class="sub">${s.sub}</p>
      </div>
      <div class="stage">${s.body}</div>
    </div></body></html>`,
    { waitUntil: "load" }
  )
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${out}/${s.file}.png` })
  console.log("butiksbild", s.file)
}

// ------------------------------------------- 4. iPhone Duo (liggande) ---
// 5244 × 2950: ritas i en 1311 × 737,5-yta (text till vänster, bilder till höger) och förstoras ×4.
const duo = [
  { ...slides[0], body:
      at(appPhone("app-1-idag"), { left: 985, top: 130, width: 260, rotate: 5, z: 1 }) +
      at(pic("landing-hero-phone", "glow"), { left: 730, top: 55, width: 300, z: 2 }) },
  { ...slides[1], body:
      at(card("landing-sync", 520, 761), { left: 640, top: 110, width: 520, rotate: -1.5 }) +
      at(appPhone("app-1-idag"), { left: 1010, top: 170, width: 250, rotate: 3, z: 2 }) },
  { ...slides[2], body:
      at(card("landing-food", 180, 371), { left: 780, top: 52, width: 180, rotate: -1.5 }) +
      at(appPhone("app-1-idag"), { left: 1000, top: 150, width: 260, rotate: 3, z: 2 }) },
  { ...slides[3], body:
      at(card("landing-calendar", 560, 761), { left: 620, top: 90, width: 560, rotate: 1.5 }) +
      at(appPhone("app-4-kalender"), { left: 1000, top: 250, width: 250, rotate: -3, z: 2 }) },
  { ...slides[4], body:
      at(appPhone("app-2-framsteg"), { left: 985, top: 140, width: 260, rotate: 5, z: 1 }) +
      at(pic("landing-progress-phone", "glow"), { left: 720, top: 70, width: 310, z: 2 }) },
  { ...slides[5], body:
      at(appPhone("app-5-chatt"), { left: 985, top: 140, width: 260, rotate: 5, z: 1 }) +
      at(pic("landing-chat-phone", "glow"), { left: 730, top: 60, width: 300, z: 2 }) },
  { ...slides[6], body:
      at(appPhone("app-3-hitta-pt"), { left: 720, top: 90, width: 290, rotate: -2 }) +
      at(card("landing-verified", 240, 371), { left: 990, top: 200, width: 240, rotate: 4, z: 2 }) },
]
const duoCss = `
  html{zoom:2}
  html,body{margin:0;width:1311px;height:737.5px;overflow:hidden;background:#07090b}
  body{font-family:var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased;color:#fff}
  .page{position:relative;width:1311px;height:737.5px;overflow:hidden;background:#07090b}
  .grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);background-size:44px 44px;-webkit-mask-image:radial-gradient(ellipse at 30% 45%,#000 20%,transparent 70%)}
  .glow1{position:absolute;top:-260px;left:-160px;width:760px;height:760px;border-radius:50%;background:radial-gradient(closest-side,rgba(172,237,55,.26),transparent)}
  .glow2{position:absolute;bottom:-260px;right:-120px;width:680px;height:680px;border-radius:50%;background:radial-gradient(closest-side,rgba(52,211,153,.18),transparent)}
  .head{position:absolute;left:84px;top:0;bottom:0;width:520px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start}
  .chip{display:inline-flex;align-items:center;gap:9px;border:1px solid rgba(172,237,55,.32);background:rgba(172,237,55,.10);color:#c8f55a;border-radius:999px;padding:7px 15px;font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase}
  .dot{width:7px;height:7px;border-radius:50%;background:#aced37;box-shadow:0 0 10px #aced37}
  h1{margin:24px 0 0;font-size:70px;line-height:1.02;font-weight:700;letter-spacing:-.03em}
  .lime{background:linear-gradient(90deg,#d4f75e,#8be37a);-webkit-background-clip:text;background-clip:text;color:transparent}
  .sub{margin:22px 0 0;max-width:440px;font-size:21px;line-height:1.4;color:rgba(255,255,255,.72)}
  .stage{position:absolute;inset:0}
  .asset{position:absolute}
  .asset img{display:block;width:100%}
  .card{background:#11161a;box-shadow:0 30px 80px -10px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.06)}
  .glow{filter:drop-shadow(0 40px 70px rgba(172,237,55,.22))}
  .frame{border-radius:46px;border:1px solid rgba(255,255,255,.16);background:#05070a;padding:9px;box-shadow:0 40px 100px -20px rgba(172,237,55,.35),0 30px 60px -10px rgba(0,0,0,.6)}
  .screen{position:relative;overflow:hidden;border-radius:38px;background:#fff}
  .screen img{display:block;width:100%;aspect-ratio:1320/2300;object-fit:cover;object-position:top}
  .island{position:absolute;left:50%;top:9px;width:86px;height:24px;transform:translateX(-50%);border-radius:999px;background:#000}
`
fs.mkdirSync(`${out}/duo`, { recursive: true })
// Viewporten har heltalsmått (2622 × 1475, ×2) och sidan zoomas ×2.
const wide = await (await browser.newContext({ viewport: { width: 2622, height: 1475 }, deviceScaleFactor: 2 })).newPage()
await wide.goto(base + "/integritet")
for (const s of duo) {
  await wide.setContent(
    `<!doctype html><html lang="sv" class="${bodyClass}"><head><meta charset="utf-8">
    ${siteCss.map((h) => `<link rel="stylesheet" href="${h}">`).join("")}
    <style>${duoCss}</style></head>
    <body class="${bodyClass}"><div class="page">
      <div class="grid"></div><div class="glow1"></div><div class="glow2"></div>
      <div class="stage">${s.body}</div>
      <div class="head">
        <span class="chip"><span class="dot"></span>${s.eyebrow}</span>
        <h1>${s.title}</h1>
        <p class="sub">${s.sub}</p>
      </div>
    </div></body></html>`,
    { waitUntil: "load" }
  )
  await wide.evaluate(() => document.fonts.ready)
  await wide.waitForTimeout(300)
  await wide.screenshot({ path: `${out}/duo/${s.file}.png` })
  console.log("duo", s.file)
}

await browser.close()
