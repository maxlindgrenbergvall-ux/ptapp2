// E2E för v10 i demoläge: dynamiska förnamn (inga hårdkodade namn), klientens
// kalender med veckoslider, "Synka kalender" (.ics-export) och animationer som
// startar när de syns (även på mobil).
//   BASE_URL=http://localhost:3000 node e2e/v10-ux.test.mjs
import { chromium } from "playwright"
import fs from "node:fs"

const out = process.argv[2] ?? "e2e/screenshots"
fs.mkdirSync(out, { recursive: true })
const base = process.env.BASE_URL ?? "http://localhost:3000"
const ok = (m) => console.log("ok  ", m)
const fail = (m) => {
  console.log("FAIL", m)
  process.exitCode = 1
}
const check = (c, m) => (c ? ok(m) : fail(m))
const errors = []
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, acceptDownloads: true })
const p = await ctx.newPage()
p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))
const demo = () => p.evaluate(() => JSON.parse(localStorage["coavira:demo:v3"]))
const setName = (kind, id, name) =>
  p.evaluate(
    ([kind, id, name]) => {
      const s = JSON.parse(localStorage["coavira:demo:v3"])
      s.data[kind] = s.data[kind].map((x) => (x.id === id ? { ...x, name } : x))
      localStorage["coavira:demo:v3"] = JSON.stringify(s)
    },
    [kind, id, name]
  )

// ------------------------------------------------- 1. dynamiska förnamn ---
await p.goto(`${base}/klient`)
await p.waitForSelector("text=Dagens träning")
const seedClient = (await demo()).data.clients.find((c) => c.id === "c1").name.split(" ")[0]
check(await p.locator(`h1:has-text("Hej ${seedClient}!")`).isVisible(), `klient: "Hej ${seedClient}!" från profilen`)
await setName("clients", "c1", "Alexandra Testsson")
await p.reload()
await p.waitForSelector("text=Dagens träning")
check(await p.locator('h1:has-text("Hej Alexandra!")').isVisible(), "klient: hälsningen följer profilens namn (inte hårdkodad)")

await p.setViewportSize({ width: 1280, height: 900 })
await setName("trainers", "t1", "Kim Coachsson")
await p.goto(`${base}/pt`)
await p.waitForSelector("text=Översikt")
check(await p.locator("text=/Hej Kim! Så här ser det ut idag/").isVisible(), "PT: \"Hej Kim!\" från profilen (tidigare hårdkodat \"Hej Elin\")")
check(await p.locator("aside >> text=Kim Coachsson").isVisible(), "PT: profilkortet i menyn visar profilens namn")
const html = await p.content()
check(!/Hej Elin/.test(html), "inget hårdkodat \"Hej Elin\" kvar")
await p.setViewportSize({ width: 390, height: 844 })

// --------------------------------------- 2. klientens kalender (mobil) ---
await p.goto(`${base}/klient/kalender`)
await p.waitForSelector("text=Mina pass")
check(await p.locator('[role=tab][aria-selected=true]:has-text("Vecka")').isVisible(), "veckovyn är standard")
const todayBtn = p.locator('button[aria-pressed=true][aria-label*="(idag)"]')
check((await todayBtn.count()) === 1, "idag är vald i veckoslidern")
check((await p.locator("ol[aria-label^='Vecka'] > li").count()) === 7, "veckoslidern visar sju dagar")
await p.screenshot({ path: `${out}/v10-klient-vecka.png` })

// Välj första dagen med pass den här eller nästa vecka och se dagens pass under.
let dayWithPass = p.locator("ol[aria-label^='Vecka'] button:not([aria-label*='inga pass'])").first()
if ((await dayWithPass.count()) === 0) {
  await p.click('button[aria-label="Nästa vecka"]')
  dayWithPass = p.locator("ol[aria-label^='Vecka'] button:not([aria-label*='inga pass'])").first()
}
const label = await dayWithPass.getAttribute("aria-label")
await dayWithPass.click()
await p.waitForTimeout(250)
const agendaItems = await p.locator("section[aria-label] > ul > li").count()
check(agendaItems >= 1, `dagsvyn visar den valda dagens pass (${label})`)
await p.screenshot({ path: `${out}/v10-klient-dag.png` })

// Svep åt vänster → nästa vecka
const weekLabel = async () => (await p.locator("text=/ · v\\. \\d+/").first().innerText()).trim()
const before = await weekLabel()
await p.evaluate(() => {
  const el = document.querySelector("ol[aria-label^='Vecka']").parentElement
  const mk = (type, x) =>
    new TouchEvent(type, {
      bubbles: true,
      cancelable: true,
      touches: type === "touchend" ? [] : [new Touch({ identifier: 1, target: el, clientX: x, clientY: 200 })],
      changedTouches: [new Touch({ identifier: 1, target: el, clientX: x, clientY: 200 })],
    })
  el.dispatchEvent(mk("touchstart", 300))
  el.dispatchEvent(mk("touchend", 120))
})
await p.waitForTimeout(250)
check((await weekLabel()) !== before, `svep byter vecka (${before} → ${await weekLabel()})`)
check(await p.locator('button:has-text("Idag") >> visible=true').isVisible(), "\"Idag\" tar en tillbaka")
await p.click('button:has-text("Idag") >> visible=true')
check((await p.locator('button[aria-pressed=true][aria-label*="(idag)"]').count()) === 1, "tillbaka på idag")

// Tom dag → genväg till nästa pass
const empty = p.locator("ol[aria-label^='Vecka'] button[aria-label*='inga pass']").first()
if (await empty.count()) {
  await empty.click()
  const next = p.locator('button:has-text("Nästa:")')
  if (await next.count()) {
    await next.click()
    await p.waitForTimeout(200)
    check((await p.locator("section[aria-label] > ul > li").count()) >= 1, "tom dag: \"Nästa\" hoppar till nästa pass")
  }
}

// Listvyn finns kvar för överblick
await p.click('[role=tab]:has-text("Lista")')
check((await p.locator("section[aria-label] h2").count()) >= 2, "listvyn visar alla kommande dagar")

// --------------------------------------------- 3. Synka kalender (.ics) ---
await p.click('button:has-text("Synka kalender")')
await p.waitForSelector("text=Demoläge: automatisk synk kräver ett riktigt konto")
const [download] = await Promise.all([p.waitForEvent("download"), p.click("text=Ladda ner .ics-fil")])
const ics = fs.readFileSync(await download.path(), "utf8")
check(download.suggestedFilename() === "coavira-pass.ics", "synk: .ics-fil laddas ner")
check(ics.startsWith("BEGIN:VCALENDAR") && ics.includes("BEGIN:VEVENT") && ics.includes("SUMMARY:PT-pass med Kim Coachsson"), "synk: filen innehåller passen med PT:ns namn")
check(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75), "synk: raderna följer RFC 5545 (max 75 oktetter)")
await p.keyboard.press("Escape")
const api = await fetch(`${base}/api/calendar/feed/${"ab".repeat(32)}.ics`)
check(api.status === 503, "synk: prenumerationslänk kräver Supabase (503 i demoläge)")
check((await fetch(`${base}/api/calendar/feed/hej.ics`)).status === 404, "synk: felformad länk ger 404")

// ------------------------------------- 4. animationer som startar i bild ---
await p.setViewportSize({ width: 390, height: 500 })
await p.goto(`${base}/klient/framsteg`)
await p.waitForSelector("text=Styrka")
await p.waitForTimeout(400)
const hidden = await p.locator('[data-revealed="false"]').count()
check(hidden >= 1, `diagram utanför skärmen ritas inte direkt (${hidden} väntar)`)
await p.evaluate(async () => {
  for (let y = 0; y <= document.body.scrollHeight; y += 200) {
    window.scrollTo(0, y)
    await new Promise((r) => setTimeout(r, 60))
  }
})
await p.waitForTimeout(800)
check((await p.locator('[data-revealed="false"]').count()) === 0, "diagrammen ritas (och animeras) när man scrollar dit")
check((await p.locator('[data-revealed="true"] .recharts-surface').count()) >= hidden, "diagrammen syns efter scroll")
await p.setViewportSize({ width: 390, height: 844 })

// Staplar (kalorier/makron) växer fram från 0 när de syns.
const fresh = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
await fresh.goto(`${base}/klient`)
await fresh.waitForSelector("text=Dagens kost")
const kcalBar = fresh.locator('[role=progressbar][aria-label="Kalorier"] > div')
const widthBefore = await fresh.evaluate(() => {
  const el = document.querySelector('[role=progressbar][aria-label="Fett"] > div')
  const r = el.parentElement.getBoundingClientRect()
  return r.top > window.innerHeight * 0.9 ? el.style.width : "synlig"
})
await kcalBar.scrollIntoViewIfNeeded()
await fresh.locator('[role=progressbar][aria-label="Fett"]').scrollIntoViewIfNeeded()
await fresh.waitForTimeout(900)
const kcalWidth = await kcalBar.evaluate((el) => el.style.width)
check(kcalWidth !== "0%" && kcalWidth !== "", `kaloristapeln växer fram när den syns (${kcalWidth})`)
if (widthBefore !== "synlig") check(widthBefore === "0%", "stapel nedanför skärmen väntar på 0 % tills man scrollar dit")

// Minska rörelse: inga animationer
const rm = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" })
const q = await rm.newPage()
await q.goto(`${base}/klient`)
await q.waitForSelector("text=Dagens träning")
const dur = await q.evaluate(() => getComputedStyle(document.querySelector("[data-slot=button]")).transitionDuration)
check(parseFloat(dur) < 0.05, `"minska rörelse" i systemet stänger av animationer (${dur})`)

console.log(errors.length ? errors.join("\n") : "inga sidfel")
if (errors.length) process.exitCode = 1
await browser.close()
